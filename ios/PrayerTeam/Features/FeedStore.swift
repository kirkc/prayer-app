import Foundation

// Feed state: status filter, cursor pagination, pull-to-refresh, and the
// optimistic mutations (pray toggle, triage) mirroring the web's
// revert-on-failure idiom.
@Observable
@MainActor
final class FeedStore {
    let api: APIClient
    private let pageSize = 25

    // "active" | "archived" | "spam" — mirrors the web dashboard's tabs.
    var status = "active"

    private(set) var items: [PrayerRequest] = []
    private(set) var nextCursor: String?
    private(set) var loading = false
    var errorMessage: String?
    var me: Me?

    init(api: APIClient) {
        self.api = api
    }

    var smsEnabled: Bool { me?.org.smsEnabled ?? false }

    private var feedPath: String {
        "/api/prayers?status=\(status)&limit=\(pageSize)"
    }

    func loadInitial() async {
        guard !loading else { return }
        loading = true
        errorMessage = nil
        defer { loading = false }
        do {
            async let mine: Me = api.get("/api/me")
            let page: FeedPage = try await api.get(feedPath)
            items = page.items
            nextCursor = page.nextCursor
            me = try? await mine
        } catch {
            print("[feed] loadInitial failed:", error)
            errorMessage = (error as? APIError)?.message ?? "Could not load prayer requests."
        }
    }

    func switchStatus(to newStatus: String) async {
        guard newStatus != status else { return }
        status = newStatus
        items = []
        nextCursor = nil
        await loadInitial()
    }

    func loadMoreIfNeeded(current: PrayerRequest) async {
        guard let cursor = nextCursor, !loading,
              current.id == items.last?.id else { return }
        loading = true
        defer { loading = false }
        do {
            let escaped = cursor.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? cursor
            let page: FeedPage = try await api.get("\(feedPath)&cursor=\(escaped)")
            items.append(contentsOf: page.items)
            nextCursor = page.nextCursor
        } catch {
            // Quietly stop paging; pull-to-refresh recovers.
        }
    }

    func refresh() async {
        do {
            let page: FeedPage = try await api.get(feedPath)
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

    // Archive / mark spam / restore. The row leaves this status's list
    // immediately; a failed call puts it back.
    func setStatus(_ request: PrayerRequest, to newStatus: String) async {
        guard let idx = items.firstIndex(where: { $0.id == request.id }) else { return }
        let removed = items.remove(at: idx)
        do {
            let _: SimpleSuccess = try await api.patch(
                "/api/prayers/\(request.id)",
                body: ["status": newStatus]
            )
        } catch {
            items.insert(removed, at: min(idx, items.count))
            errorMessage = (error as? APIError)?.message ?? "Could not update the request."
        }
    }

    // A reply just went out: the server marked it replied and counted it as
    // a prayer — reflect that on the card.
    func applyRespondResult(_ requestId: String, _ result: RespondResult) {
        guard let i = items.firstIndex(where: { $0.id == requestId }) else { return }
        items[i].replied = result.replied
        items[i].youPrayed = result.youPrayed
        items[i].prayedCount = result.prayedCount
    }

    func current(_ id: String) -> PrayerRequest? {
        items.first(where: { $0.id == id })
    }

    // A push deep-link fetched a request that isn't in the visible list
    // (different status, or newer than the last refresh) — front-insert it so
    // the detail view has live state to read.
    func insertFetched(_ request: PrayerRequest) {
        guard current(request.id) == nil else { return }
        items.insert(request, at: 0)
    }
}
