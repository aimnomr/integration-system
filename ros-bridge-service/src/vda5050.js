// VDA5050 helpers: topic-name construction, the shared message header, and
// lightweight structural validators. See docs/schema/VDA5050_MESSAGES.md.

// Build a topic: {interfaceName}/{majorVersion}/{manufacturer}/{serialNumber}/{topic}
export function buildTopic(fleet, serialNumber, topic) {
    return `${fleet.interfaceName}/${fleet.majorVersion}/${fleet.manufacturer}/${serialNumber}/${topic}`
}

// Parse a VDA5050 topic into its segments, or null if it does not match.
export function parseTopic(topic) {
    const parts = topic.split('/')
    if (parts.length !== 5) return null
    return {
        interfaceName: parts[0],
        majorVersion:  parts[1],
        manufacturer:  parts[2],
        serialNumber:  parts[3],
        message:       parts[4],
    }
}

// Produces the five-field shared header. headerId increments per topic, per robot —
// one HeaderFactory per Robot, an independent counter for each topic name.
export class HeaderFactory {
    constructor(fleet, serialNumber) {
        this._fleet    = fleet
        this._serial   = serialNumber
        this._counters = new Map()   // topic -> next headerId
    }

    next(topic) {
        const id = this._counters.get(topic) ?? 0
        this._counters.set(topic, id + 1)
        return {
            headerId:     id,
            timestamp:    new Date().toISOString(),
            version:      this._fleet.version,
            manufacturer: this._fleet.manufacturer,
            serialNumber: this._serial,
        }
    }
}

// Minimal structural validation — enough to reject malformed inbound messages.
export function isValidOrder(msg) {
    return !!msg && typeof msg.orderId === 'string' && Array.isArray(msg.nodes)
}

export function isValidInstantActions(msg) {
    return !!msg && Array.isArray(msg.actions)
}
