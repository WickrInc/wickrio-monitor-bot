'use strict'

import WickrIOAPI from 'wickrio_addon'
import WickrIOBotAPI from 'wickrio-bot-api'
import path from 'path'
import ping from './ping.js'
import https from 'https'
import winston from 'winston'
// const WickrUser = WickrIOBotAPI.WickrUser
const bot = new WickrIOBotAPI.WickrIOBot()

process.stdin.resume() // so the program will not close instantly

const tokens = JSON.parse(process.env.tokens)
const botUsername = tokens.WICKRIO_BOT_NAME.value
let pdapiToken, neighborsList

process.env.NODE_ENV = 'development'

const filename = path.join('./', 'combined.log')

const logger = winston.createLogger({
  levels: winston.config.syslog.levels,
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
      info => `${info.timestamp} ${info.level}: ${info.message}`
    )
  ),
  transports: [
    new winston.transports.File({
      filename: filename,
      maxsize: 10000000,
      maxfiles: 5,
      tailable: true,
    }),
    new winston.transports.Console({}),
  ],
})
module.exports.logger = logger

async function exitHandler(exitOptions, err) {
  console.log('Exit error:', err)
  console.log('exitOptions:', exitOptions)
  try {
    // const monitorBot = {
    //   id: botUsername,
    //   state: 'SHUTTINGDOWN',
    // }
    // TODO in future send to neighbor so they know our state
    const summary = botUsername + ' is SHUTTING DOWN.'
    const payload = JSON.stringify({
      payload: {
        summary: summary,
        source: botUsername,
        severity: 'info',
      },
      routing_key: pdapiToken,
      event_action: 'trigger',
      client: 'Bot Monitoring',
    })

    const options = {
      hostname: 'events.pagerduty.com',
      path: '/v2/enqueue',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      },
    }
    return new Promise(function (resolve, reject) {
      const req = https.request(options, res => {
        // logger.info(`statusCode: ${res.statusCode}`)
        res.on('data', d => {
          const incident = 'Exit Incident created: ' + d
          d = JSON.parse(d)
          bot.incident_dedup_key = JSON.stringify(d.dedup_key)
          resolve(incident)
        })
      })

      req.on('error', error => {
        logger.error('Incident creating error: ' + error)
      })
      req.write(payload)
      req.end()
    })
      .then(async function (incident) {
        logger.info(incident)
        await bot.close()
        logger.error('Exit options:' + exitOptions)
        if (err || exitOptions.exit) {
          logger.error('Exit reason:' + err)
          process.exit()
        } else if (exitOptions.pid) {
          process.kill(process.pid)
        }
      })
      .catch(error => {
        logger.error(error)
        // reject(error)
      })
  } catch (err) {
    logger.error(err)
  }
}

// catches ctrl+c and stop.sh events
process.on('SIGINT', exitHandler.bind(null, { exit: true }))

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { pid: true }))
process.on('SIGUSR2', exitHandler.bind(null, { pid: true }))

// catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, { exit: true }))

const neighbors = []
module.exports.neighbors = neighbors
module.exports.PagerDutyAlert = PagerDutyAlert

async function main() {
  try {
    let status
    await sleep(5000)
    if (process.argv[2] === undefined) {
      status = await bot.start(botUsername)
    } else {
      status = await bot.start(process.argv[2])
    }
    if (!status) {
      exitHandler(null, {
        exit: true,
        reason: 'Client not able to start',
      })
    }

    if (tokens.PAGERDUTY_API_KEY.encrypted) {
      pdapiToken = WickrIOAPI.cmdDecryptString(tokens.PAGERDUTY_API_KEY.value)
    } else {
      pdapiToken = tokens.PAGERDUTY_API_KEY.value
    }

    if (tokens.NEIGHBOR_BOTS_LIST.encrypted) {
      neighborsList = WickrIOAPI.cmdDecryptString(
        tokens.NEIGHBOR_BOTS_LIST.value
      )
    } else {
      neighborsList = tokens.NEIGHBOR_BOTS_LIST.value
    }
    neighborsList = neighborsList.split(',')
    logger.info('neighborsList:' + neighborsList)
    for (const i in neighborsList) {
      neighbors.push({
        id: neighborsList[i],
        state: 'UP',
        waiting: false,
        attempts: 0,
      })
    }
    logger.info('neighbors: ' + neighbors)
    const monitorBot = {
      id: botUsername,
      state: 'STARTINGUP',
    }
    PagerDutyAlert(monitorBot)
    await bot.startListening(listen)
    ping.ping()
  } catch (err) {
    logger.error(err)
  }
}

async function PagerDutyAlert(bot) {
  try {
    let summary
    if (bot.state === 'STARTINGUP') {
      logger.alert(bot.id + ' STARTING UP.')
      summary = bot.id + ' is STARTING UP.'
    } else {
      logger.alert(
        bot.id +
          ' is not responding. Timestamp: ' +
          bot.timestamp +
          '. Created by: ' +
          botUsername
      )
      summary =
        bot.id +
        ' is not responding. Timestamp: ' +
        bot.timestamp +
        '. Created by: ' +
        botUsername
    }
    const payload = JSON.stringify({
      payload: {
        summary: summary,
        source: botUsername,
        severity: 'info',
      },
      routing_key: pdapiToken,
      event_action: 'trigger',
      client: 'Bot Monitoring',
    })

    const options = {
      hostname: 'events.pagerduty.com',
      path: '/v2/enqueue',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      },
    }
    const req = https.request(options, res => {
      // logger.info(`statusCode: ${res.statusCode}`)
      res.on('data', d => {
        logger.info('Incident created: ' + d)
        d = JSON.parse(d)
        bot.incident_dedup_key = JSON.stringify(d.dedup_key)
      })
    })
    req.on('error', error => {
      logger.error('Incident creating error: ' + error)
    })
    req.write(payload)
    req.end()
  } catch (err) {
    logger.error(err)
  }
}

async function resolveAlert(bot) {
  try {
    logger.alert(bot + ' is back up')
    // const summary = bot.id + ' is back up.' + ' Created by: ' + botUsername
    const payload = JSON.stringify({
      routing_key: pdapiToken,
      dedup_key: bot.incident_dedup_key,
      event_action: 'resolve',
    })

    const options = {
      hostname: 'events.pagerduty.com',
      path: '/v2/enqueue',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      },
    }

    const req = https.request(options, res => {
      logger.info(`statusCode: ${res.statusCode}`)

      res.on('data', d => {
        logger.info('Incident resolved: ' + d)
      })
    })

    req.on('error', error => {
      logger.error('Incident resolving error: ' + error)
    })
    req.write(payload)
    req.end()
  } catch (err) {
    logger.error(err)
  }
}

function listen(msg) {
  try {
    const parsedMessage = bot.parseMessage(msg) // Parses an incoming message and returns and object with command, argument, vGroupID and Sender fields
    if (!parsedMessage) {
      return
    }
    logger.info('New incoming Message: ' + JSON.stringify(parsedMessage))
    console.log('New incoming Message: ' + JSON.stringify(parsedMessage))

    const { userEmail } = parsedMessage

    const neighborBot = neighbors.find(
      neighborBot => neighborBot.id === userEmail
    )
    if (!neighborBot) return
    if (neighborBot.state === 'DOWN') {
      resolveAlert(neighborBot)
      // TODO Always set to up on recieve message?
      neighborBot.state = 'UP'
    }
    neighborBot.waiting = false
    neighborBot.attempts = 0
    const reply = +new Date()
    const userList = [userEmail]
    const sMessage = WickrIOAPI.cmdSend1to1Message(userList, reply) // Respond back to the user(using user wickrEmail)
    logger.info(sMessage)
  } catch (err) {
    logger.error(err)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = logger

main()
