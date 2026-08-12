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
