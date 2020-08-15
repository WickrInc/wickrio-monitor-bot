import WickrIOAPI from 'wickrio_addon'
import schedule from 'node-schedule'
// import winston from 'winston'
import monitor from './index.js'

module.exports = {
  ping() {
    try {
      schedule.scheduleJob('*/1 * * * *', function () {
        monitor.logger.info('This runs every 1 minutes')
        for (const i in monitor.neighbors) {
          // monitor.logger.info('monitor.neighbors[i]: ' + monitor.neighbors[i])
          const msg = new Date().getTime() // send a timestamp as a message
          const users = [monitor.neighbors[i].id]
          try {
            // Send to all users at once don't do in loop
            // TODO don't assume that bot is up when we restart no double down messages
            const sMessage = WickrIOAPI.cmdSend1to1Message(users, msg)
            monitor.logger.info(sMessage)
          } catch (err) {
            monitor.logger.error(err)
          }
          monitor.neighbors[i].waiting = true
          monitor.neighbors[i].timestamp = msg
          setTimeout(
            function () {
              // double check to see if this is not blocking next iteration of foor loop
              // monitor.logger.info('monitor.neighbors[i]: ' + monitor.neighbors[i])
              if (monitor.neighbors[i].waiting) {
                monitor.neighbors[i].attempts += 1
              }
              console.log('Attempts count: ' + monitor.neighbors[i].attempts)
              console.log('Waiting status: ' + monitor.neighbors[i].waiting)
              console.log('Neighbor state: ' + monitor.neighbors[i].state)
              if (
                monitor.neighbors[i].attempts >= 3 &&
                monitor.neighbors[i].state !== 'DOWN'
              ) {
                monitor.neighbors[i].state = 'DOWN'
                monitor.PagerDutyAlert(monitor.neighbors[i])
              }
            },
            60000,
            monitor.neighbors[i]
          )
        }
      })
    } catch (err) {
      monitor.logger.error(err)
    }
  },
}
