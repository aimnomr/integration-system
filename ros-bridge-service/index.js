import 'dotenv/config'
import logger from './src/logger.js'
import FleetManager from './src/fleetManager.js'

// Entry point: fetch the fleet definition from FastAPI (the database is the single
// source of truth — FastAPI serves it at GET /fleet), then start the fleet. The
// FleetManager instantiates one Robot per entry; each Robot owns its own rosbridge
// connection and bridges. See docs/plans/vda5050-migration.md.

const FLEET_API_URL = process.env.FLEET_API_URL || 'http://localhost:8000/fleet'

// Fail fast on missing config — MQTT_BROKER has no safe default.
const missingEnv = ['MQTT_BROKER'].filter((name) => !process.env[name])
if (missingEnv.length) {
    logger.error('Missing required environment variable(s)', {
        missing: missingEnv,
        hint: 'Copy ros-bridge-service/.env.example to .env and fill them in.',
    })
    process.exit(1)
}

async function main() {
    let config
    try {
        // Send the API key if FastAPI's auth is enabled (G10); harmless when unset.
        const headers = process.env.API_KEY ? { 'X-API-Key': process.env.API_KEY } : {}
        const res = await fetch(FLEET_API_URL, { headers })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        config = await res.json()
    } catch (err) {
        logger.error('Failed to fetch fleet config from FastAPI', {
            url: FLEET_API_URL,
            error: err.message,
            hint: 'Is the FastAPI service running? It serves the fleet at GET /fleet.',
        })
        process.exit(1)
    }

    const fleet = new FleetManager(config)
    fleet.start()
}

main()
