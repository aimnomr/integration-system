import * as ROSLIB from 'roslib'

let currentRos = null
let shouldReconnect = true
let rosbridgeUrl = process.env.ROSBRIDGE_URL

// Stored so reconnection loop can re-invoke them without re-passing arguments
let _onConnect = null
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
        console.log('[ROS] Connected to rosbridge')
        _onConnect?.(ros)
    })

    ros.on('error', (err) => {
        console.error('[ROS] Error:', err)
    })

    ros.on('close', () => {
        currentRos = null
        _onDisconnect?.()
        if (shouldReconnect) {
            console.warn('[ROS] Connection closed — reconnecting in 3s...')
            setTimeout(createRosConnection, 3000)
        } else {
            console.log('[ROS] Disconnected intentionally')
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
