import Foundation

// Codable mirrors of the API's JSON shapes (types/index.ts). Snake_case keys
// are converted by the shared decoder in APIClient.

struct PrayerRequest: Codable, Identifiable, Hashable {
    let id: String
    let name: String?
    let request: String
    let source: String        // "web" | "sms"
    let status: String        // "active" | "archived" | "spam"
    var replied: Bool
    var prayedCount: Int
    let createdAt: Date
    let hasPhone: Bool
    var youPrayed: Bool
    // Text replies the requester sent back. Optional so a build talking to a
    // server without migration 017 still decodes.
    var replyCount: Int?
}

// One line of a request's text conversation (GET /api/prayers/[id]/thread).
// direction: "out" (a team member's reply) | "in" (the requester's text).
// A tapback the requester left on an outbound text rides along on that
// message as a glyph rather than being a line of its own.
struct ThreadReaction: Codable, Hashable {
    let glyph: String
    let at: Date
}

struct ThreadMessage: Codable, Identifiable, Hashable {
    let id: String
    let direction: String
    let body: String
    let at: Date
    let author: String?
    let reactions: [ThreadReaction]

    var isInbound: Bool { direction == "in" }
}

// A tapback on a text that isn't in the thread: the daily prayer update
// ("update"), the confirmation ("ack"), or something we couldn't match.
struct ThreadOtherReaction: Codable, Hashable {
    let glyph: String
    let at: Date
    let about: String
}

struct ThreadPage: Codable {
    let items: [ThreadMessage]
    let otherReactions: [ThreadOtherReaction]

    var isEmpty: Bool { items.isEmpty && otherReactions.isEmpty }

    // "Alex reacted ❤️ to 3 prayer updates"
    func otherReactionsLine(who: String) -> String {
        let glyphs = Array(Set(otherReactions.map(\.glyph))).sorted().joined(separator: " ")
        let n = otherReactions.count
        let updates = otherReactions.filter { $0.about == "update" }.count
        let what: String
        if updates == n {
            what = n == 1 ? "a prayer update" : "\(n) prayer updates"
        } else {
            what = n == 1 ? "a text" : "\(n) texts"
        }
        return "\(who) reacted \(glyphs) to \(what)"
    }
}

struct ReclassifyResult: Codable {
    let success: Bool
    let targetId: String
}

struct PromoteResult: Codable {
    let success: Bool
    let requestId: String
}

struct FeedPage: Codable {
    let items: [PrayerRequest]
    let nextCursor: String?
}

struct PrayResponse: Codable {
    let youPrayed: Bool
    let prayedCount: Int
}

struct RespondResult: Codable {
    let success: Bool
    let replied: Bool
    let youPrayed: Bool
    let prayedCount: Int
}

struct SimpleSuccess: Codable {
    let success: Bool
}

// Per-channel result from POST /api/settings/test. Reported separately because
// "no devices registered" and "no APNs key on the server" are both silence from
// the phone, and this is the screen where you need to tell them apart.
struct TestNotificationResult: Codable {
    struct Push: Codable {
        let configured: Bool
        let devices: Int
        let sent: Int
        let failed: Int
    }
    let email: Bool
    let push: Push

    var summary: String {
        let head = email ? "Email sent" : "Email failed"
        if !push.configured { return "\(head) · push isn't set up on the server" }
        if push.devices == 0 { return "\(head) · this device isn't registered yet" }
        if push.failed > 0 { return "\(head) · push failed for \(push.failed) of \(push.devices)" }
        return "\(head) · push sent to \(push.sent) device\(push.sent == 1 ? "" : "s")"
    }
}

struct Me: Codable {
    struct Org: Codable {
        let name: String
        let slug: String
        let smsEnabled: Bool
    }

    let id: String
    let email: String?
    let displayName: String?
    let role: String
    let org: Org
}

struct MemberSettings: Codable {
    var notifyNewRequests: Bool
    var notifyFrequency: String   // "immediate" | "daily" | "weekly"
    var notifyPush: Bool
}
