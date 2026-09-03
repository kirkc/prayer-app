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
// kind: "reply" | "reaction" — a reaction's body is Apple's tapback text
// (`Loved "…"`); the view shows it as an emoji.
struct ThreadMessage: Codable, Identifiable, Hashable {
    let id: String
    let direction: String
    let kind: String
    let body: String
    let at: Date
    let author: String?

    var isReaction: Bool { kind == "reaction" }
    var isInbound: Bool { direction == "in" }

    var reactionGlyph: String {
        if body.hasPrefix("Loved") { return "❤️" }
        if body.hasPrefix("Liked") { return "👍" }
        if body.hasPrefix("Disliked") { return "👎" }
        if body.hasPrefix("Laughed at") { return "😂" }
        if body.hasPrefix("Emphasized") { return "‼️" }
        if body.hasPrefix("Questioned") { return "❓" }
        if body.hasPrefix("Reacted "), let range = body.range(of: " to ") {
            return String(body[body.index(body.startIndex, offsetBy: 8)..<range.lowerBound])
        }
        return "❤️"
    }
}

struct ThreadPage: Codable {
    let items: [ThreadMessage]
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
