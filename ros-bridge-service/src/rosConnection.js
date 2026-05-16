import * as ROSLIB from 'roslib'
import logger from './logger.js'
import { publishConnection, reportError } from './health.js'

let currentRos     = null
let shouldReconnect = true
let rosbridgeUrl   = process.env.ROSBRIDGE_URL

// Stored so the reconnection loop can re-invoke them without re-passing arguments
let _onConnect    = null
let _onDisconnect = null

export function getRos() {
    return currentRos
}

export function createRosConnection({ onConnect, onDisconnect } = {}) {
    if (onConnect)    _onConnect    = onConnect
    if (onDisconnect) _onDisconnect = onDisconnect

    const ros = new ROSLIB.Ros({ url: rosbridgeUrl })
    currentRos = ros

    ros.on('connection', () => {
        logger.info('Connected to rosbridge', { url: rosbridgeUrl })
        publishConnection(true, rosbridgeUrl)
        _onConnect?.(ros)
    })

    ros.on('error', (err) => {
        const message = String(err?.message || err)
        logger.error('rosbridge error', { error: message })
        reportError('ROS_CONNECTION_ERROR', message, 'rosConnection')
    })

    ros.on('close', () => {
        currentRos = null
        publishConnection(false, rosbridgeUrl)
        _onDisconnect?.()
        if (shouldReconnect) {
            logger.warn('rosbridge connection closed — reconnecting in 3s')
            setTimeout(createRosConnection, 3000)
        } else {
            logger.info('rosbridge disconnected intentionally')
        }
    })
}

export function reconnectRos(url) {
    if (url) rosbridgeUrl = url
    shouldReconnect = true
    if (currentRos) currentRos.close()   // triggers auto-reconnect via ros.on('close')
    else createRosConnection()
}

export function disconnectRos() {
    shouldReconnect = false
    if (currentRos) currentRos.close()
}
