import SwiftUI

struct FeedView: View {
    @Environment(AuthStore.self) private var auth
    @State private var store: FeedStore?
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            Group {
                if let store {
                    feed(store)
                } else {
                    ProgressView().tint(Color.sage500)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.mist50.ignoresSafeArea())
            .navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Prayer requests")
                            .font(.display(24))
                            .foregroundStyle(Color.ink800)
                    }
                }
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
        }
        .task {
            if store == nil {
                let s = FeedStore(api: APIClient(auth: auth))
                store = s
                await s.loadInitial()
            }
        }
    }

    @ViewBuilder
    private func feed(_ store: FeedStore) -> some View {
        if let error = store.errorMessage, store.items.isEmpty {
            VStack(spacing: 12) {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundStyle(Color.ink400)
                Button("Try again") { Task { await store.loadInitial() } }
                    .buttonStyle(SoftButtonStyle())
            }
            .padding(32)
        } else if store.items.isEmpty && !store.loading {
            VStack(spacing: 8) {
                Text("All quiet")
                    .font(.display(22))
                    .foregroundStyle(Color.ink800)
                Text("New prayer requests will appear here.")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.ink400)
            }
            .padding(32)
        } else {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(Array(store.items.enumerated()), id: \.element.id) { index, prayer in
                        PrayerCardView(prayer: prayer) {
                            Task { await store.togglePray(prayer) }
                        }
                        .riseIn(delay: min(Double(index) * 0.06, 0.4))
                        .onAppear {
                            Task { await store.loadMoreIfNeeded(current: prayer) }
                        }
                    }
                    if store.loading && !store.items.isEmpty {
                        ProgressView()
                            .tint(Color.sage500)
                            .padding(.vertical, 16)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .refreshable { await store.refresh() }
        }
    }
}
