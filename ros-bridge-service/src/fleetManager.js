import { readFileSync } from 'node:fs'
import Robot from './robot.js'
import logger from './logger.js'

// Owns the fleet: builds one Robot per robots.config.json entry. Each Robot owns its
// own MQTT client and rosbridge connection, so the fleet is fully isolated per robot
// — adding a robot is an edit to the config file, no code change.
export default class FleetManager {
    constructor(configPath) {
        this._config = JSON.parse(readFileSync(configPath, 'utf-8'))
        this._robots = new Map()   // serialNumber -> Robot
    }

    start() {
        const { robots, ...fleetConfig } = this._config

        for (const robotConfig of robots) {
            const robot = new Robot(fleetConfig, robotConfig)
            this._robots.set(robotConfig.serialNumber, robot)
            robot.start()
        }
        logger.info('Fleet started', { count: this._robots.size })

        const shutdown = () => {
            logger.info('Shutting down fleet')
            for (const robot of this._robots.values()) robot.stop()
            setTimeout(() => process.exit(0), 500)
        }
        process.on('SIGINT', shutdown)
        process.on('SIGTERM', shutdown)
    }
}
