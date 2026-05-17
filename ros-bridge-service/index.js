import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import FleetManager from './src/fleetManager.js'

// Entry point: load the robot registry and start the fleet. The FleetManager
// instantiates one Robot per robots.config.json entry; each Robot owns its own
// rosbridge connection and bridges. See docs/plans/vda5050-migration.md.
const here       = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, 'robots.config.json')

const fleet = new FleetManager(configPath)
fleet.start()
