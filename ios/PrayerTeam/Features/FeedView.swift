import SwiftUI

// Where a tap goes. `respond` carries the intent to open the reply sheet on
// arrival, so the bubble on a card is one tap from a keyboard.
enum FeedRoute: Hashable {
    case detail(PrayerRequest)
    case respond(PrayerRequest)
}

struct FeedView: View {
    @Environment(AuthStore.self) private var auth
    @State private var store: FeedStore?
    @State private var showSettings = false
    @State private var path = NavigationPath()

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let store {
                    feed(store)
                } else {
                    ProgressView().tint(Color.sage500)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.mist50.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "person.crop.circle")
                            .foregroundStyle(Color.ink400)
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .navigationDestination(for: FeedRoute.self) { route in
                if let store {
                    switch route {
                    case .detail(let prayer):
                        RequestDetailView(store: store, requestId: prayer.id)
                    case .respond(let prayer):
                        RequestDetailView(store: store, requestId: prayer.id, autoRespond: true)
                    }
                }
            }
        }
        .task {
            if store == nil {
                let s = FeedStore(api: APIClient(auth: auth))
                store = s
                await s.loadInitial()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .pushRequestTapped)) { note in
            guard let id = note.userInfo?["request_id"] as? String else { return }
            Task { await openFromPush(id) }
        }
    }

    // A push was tapped: make sure the request is in the store (it may have
    // arrived after the last refresh), then navigate straight to it.
    private func openFromPush(_ id: String) async {
        guard let store else { return }
        if store.current(id) == nil {
            await store.refresh()
        }
        if store.current(id) == nil {
            // Not in this status list (e.g. already archived) — fetch it and
            // surface it at the top so the detail view has state to read.
            if let fetched: PrayerRequest = try? await store.api.get("/api/prayers/\(id)") {
                store.insertFetched(fetched)
            }
        }
        if let prayer = store.current(id) {
            path = NavigationPath()
            path.append(FeedRoute.detail(prayer))
        }
    }

    @ViewBuilder
    private func feed(_ store: FeedStore) -> some View {
        List {
            header(store)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))

            if let error = store.errorMessage, store.items.isEmpty {
                VStack(spacing: 12) {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundStyle(Color.ink400)
                    Button("Try again") { Task { await store.loadInitial() } }
                        .buttonStyle(SoftButtonStyle())
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else if store.items.isEmpty && !store.loading {
                VStack(spacing: 8) {
                    Text(emptyTitle(store.status))
                        .font(.display(22))
                        .foregroundStyle(Color.ink800)
                    Text(emptySubtitle(store.status))
                        .font(.system(size: 14))
                        .foregroundStyle(Color.ink400)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            } else {
                ForEach(Array(store.items.enumerated()), id: \.element.id) { index, prayer in
                    ZStack {
                        NavigationLink(value: FeedRoute.detail(prayer)) { EmptyView() }.opacity(0)
                        PrayerCardView(
                            prayer: prayer,
                            canReply: prayer.hasPhone && store.smsEnabled,
                            onPray: { Task { await store.togglePray(prayer) } },
                            onRespond: { path.append(FeedRoute.respond(prayer)) }
                        )
                    }
                    .riseIn(delay: min(Double(index) * 0.06, 0.4))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        trailingActions(store, prayer)
                    }
                    .onAppear {
                        Task { await store.loadMoreIfNeeded(current: prayer) }
                    }
                }
                if store.loading && !store.items.isEmpty {
                    ProgressView()
                        .tint(Color.sage500)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .refreshable { await store.refresh() }
    }

    private func header(_ store: FeedStore) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Prayer requests")
                    .font(.display(30))
                    .foregroundStyle(Color.ink800)
                if let org = store.me?.org {
                    Text(org.name)
                        .font(.system(size: 13))
                        .foregroundStyle(Color.ink400)
                }
            }

            // The web's segmented pill: Active / Archived / Spam.
            HStack(spacing: 4) {
                ForEach([("active", "Active"), ("archived", "Archived"), ("spam", "Spam")], id: \.0) { value, label in
                    Button {
                        Task { await store.switchStatus(to: value) }
                    } label: {
                        Text(label)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(store.status == value ? Color.ink700 : Color.ink400)
                            .padding(.vertical, 6)
                            .padding(.horizontal, 14)
                            .background(
                                store.status == value ? Color.white : Color.clear,
                                in: Capsule()
                            )
                            .shadow(color: store.status == value ? Color.ink800.opacity(0.06) : .clear,
                                    radius: 2, y: 1)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(4)
            .background(Color.mist100, in: Capsule())
        }
        .padding(.bottom, 4)
    }

    @ViewBuilder
    private func trailingActions(_ store: FeedStore, _ prayer: PrayerRequest) -> some View {
        switch store.status {
        case "active":
            Button {
                Task { await store.setStatus(prayer, to: "archived") }
            } label: {
                Label("Archive", systemImage: "archivebox")
            }
            .tint(Color.sage600)
            Button {
                Task { await store.setStatus(prayer, to: "spam") }
            } label: {
                Label("Spam", systemImage: "nosign")
            }
            .tint(Color.ink500)
        default:
            Button {
                Task { await store.setStatus(prayer, to: "active") }
            } label: {
                Label("Restore", systemImage: "arrow.uturn.backward")
            }
            .tint(Color.sage600)
        }
    }

    private func emptyTitle(_ status: String) -> String {
        status == "active" ? "All quiet" : "Nothing here"
    }

    private func emptySubtitle(_ status: String) -> String {
        switch status {
        case "archived": return "Archived requests will appear here."
        case "spam": return "Requests marked as spam will appear here."
        default: return "New prayer requests will appear here."
        }
    }
}
