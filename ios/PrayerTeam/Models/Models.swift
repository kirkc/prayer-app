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
}
