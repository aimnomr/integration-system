import Robot from './robot.js'
import logger from './logger.js'

// Owns the fleet: builds one Robot per entry in the fleet config. Each Robot owns its
// own MQTT client and rosbridge connection, so the fleet is fully isolated per robot.
// The fleet config is fetched from FastAPI's GET /fleet (the database is the single
// source of truth) — adding a robot is a database edit, no code change.
export default class FleetManager {
    constructor(config) {
        this._config = config      // { interfaceName, majorVersion, version, manufacturer, robots }
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
