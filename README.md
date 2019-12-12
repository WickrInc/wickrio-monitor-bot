# Wickr IO Monitor Bot
Monitor Bot or TownCrier Bot is an integration that alerts the dev-ops team through PagerDuty incidents whenever other monitoring bots are down and once they came back up.

Note: All logs go to a file named combined.log in the root directory of the integration, log files would be replaced once they reach a size of 10mb and until a maximum of 5 files is reached, then the oldest log file would be deleted each time a new one is created. This configurable in lines 32-33 of monitor-bot.js under the maxsize and maxfiles properties.

## Configuration:
Wickr IO integrations are configured by running the configure.sh file,
to add any additional tokens you want to prompt for do so by adding them to the array in line 63 in configure.js

Required tokens:
- PAGERDUTY_API_KEY - PagerDuty V2 Events API Key
- NEIGHBOR_BOTS_LIST - Comma separated list of neighbor monitoring bot names(no spaces in the list)
