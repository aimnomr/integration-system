// Lightweight structured logger — emits one JSON object per line.
// No external dependency; set LOG_LEVEL (debug|info|warn|error) to filter.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const minLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info
const SERVICE = 'ros-bridge-service'

function emit(level, msg, fields) {
    if (LEVELS[level] < minLevel) return
    const entry = { ts: new Date().toISOString(), level, service: SERVICE, msg, ...fields }
    const line = JSON.stringify(entry)
    if (level === 'error') process.stderr.write(line + '\n')
    else process.stdout.write(line + '\n')
}

export default {
    debug: (msg, fields) => emit('debug', msg, fields),
    info:  (msg, fields) => emit('info',  msg, fields),
    warn:  (msg, fields) => emit('warn',  msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
}
