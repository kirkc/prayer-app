import Foundation

// Feed state: cursor pagination, pull-to-refresh, and the optimistic pray
// toggle (mirroring the web's revert-on-failure idiom).
@Observable
@MainActor
final class FeedStore {
    private let api: APIClient
    private let pageSize = 25

    private(set) var items: [PrayerRequest] = []
    private(set) var nextCursor: String?
    private(set) var loading = false
    var errorMessage: String?
    var me: Me?

    init(api: APIClient) {
        self.api = api
    }

    func loadInitial() async {
        guard !loading else { return }
        loading = true
        errorMessage = nil
        defer { loading = false }
        do {
            async let mine: Me = api.get("/api/me")
            let page: FeedPage = try await api.get("/api/prayers?limit=\(pageSize)")
            items = page.items
            nextCursor = page.nextCursor
            me = try? await mine
        } catch {
            print("[feed] loadInitial failed:", error)
            errorMessage = (error as? APIError)?.message ?? "Could not load prayer requests."
        }
    }

    func loadMoreIfNeeded(current: PrayerRequest) async {
        guard let cursor = nextCursor, !loading,
              current.id == items.last?.id else { return }
        loading = true
        defer { loading = false }
        do {
            let escaped = cursor.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cursor
            let page: FeedPage = try await api.get("/api/prayers?limit=\(pageSize)&cursor=\(escaped)")
            items.append(contentsOf: page.items)
            nextCursor = page.nextCursor
        } catch {
            // Quietly stop paging; pull-to-refresh recovers.
        }
    }

    func refresh() async {
        do {
            let page: FeedPage = try await api.get("/api/prayers?limit=\(pageSize)")
            items = page.items
            nextCursor = page.nextCursor
            errorMessage = nil
        } catch {
            errorMessage = (error as? APIError)?.message ?? "Could not refresh."
        }
    }

    // Optimistic: flip locally, call the API, adopt the server's answer —
    // revert if the call fails.
    func togglePray(_ request: PrayerRequest) async {
        guard let idx = items.firstIndex(where: { $0.id == request.id }) else { return }
        let wasPrayed = items[idx].youPrayed
        items[idx].youPrayed = !wasPrayed
        items[idx].prayedCount += wasPrayed ? -1 : 1

        do {
            let result: PrayResponse = wasPrayed
                ? try await api.delete("/api/prayers/\(request.id)/pray")
                : try await api.post("/api/prayers/\(request.id)/pray")
            if let i = items.firstIndex(where: { $0.id == request.id }) {
                items[i].youPrayed = result.youPrayed
                items[i].prayedCount = result.prayedCount
            }
        } catch {
            if let i = items.firstIndex(where: { $0.id == request.id }) {
                items[i].youPrayed = wasPrayed
                items[i].prayedCount += wasPrayed ? 1 : -1
            }
        }
    }
}
