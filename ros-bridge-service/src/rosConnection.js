import * as ROSLIB from 'roslib'
import logger from './logger.js'

// Manages one robot's rosbridge WebSocket connection, with auto-reconnect.
// One RosConnection instance per Robot. Connection-state and error events are
// surfaced via callbacks — the Robot turns them into `connection` messages and
// `state.errors` entries.
export default class RosConnection {
    constructor({ url, onConnect, onDisconnect, onError }) {
        this._url             = url
        this._onConnect       = onConnect
        this._onDisconnect    = onDisconnect
        this._onError         = onError
        this._ros             = null
        this._shouldReconnect = true
    }

    // The live ROSLIB.Ros handle, or null when disconnected.
    get ros() {
        return this._ros
    }

    connect() {
        const ros = new ROSLIB.Ros({ url: this._url })
        this._ros = ros

        ros.on('connection', () => {
            logger.info('Connected to rosbridge', { url: this._url })
            this._onConnect?.(ros)
        })

        ros.on('error', (err) => {
            const message = String(err?.message || err)
            logger.error('rosbridge error', { error: message })
            this._onError?.('ROS_CONNECTION_ERROR', message)
        })

        ros.on('close', () => {
            this._ros = null
            this._onDisconnect?.()
            if (this._shouldReconnect) {
                logger.warn('rosbridge connection closed — reconnecting in 3s')
                setTimeout(() => this.connect(), 3000)
            } else {
                logger.info('rosbridge disconnected intentionally')
            }
        })
    }

    disconnect() {
        this._shouldReconnect = false
        if (this._ros) this._ros.close()
    }
}
