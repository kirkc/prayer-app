import SwiftUI

struct PrayerCardView: View {
    let prayer: PrayerRequest
    let onPray: () -> Void

    private static let relative: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .full
        return f
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(prayer.name?.isEmpty == false ? prayer.name! : "Anonymous")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.ink400)
                Text(prayer.source == "sms" ? "· via text" : "· via web")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.ink300)
                Spacer()
                Text(Self.relative.localizedString(for: prayer.createdAt, relativeTo: .now))
                    .font(.system(size: 12))
                    .foregroundStyle(Color.ink300)
            }

            Text(prayer.request)
                .font(.system(size: 15))
                .fontWeight(.light)
                .foregroundStyle(Color.ink700)
                .lineSpacing(4)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 10) {
                Button {
                    onPray()
                } label: {
                    Label(
                        prayer.youPrayed ? "Prayed" : "Pray",
                        systemImage: prayer.youPrayed ? "heart.fill" : "heart"
                    )
                }
                .buttonStyle(SoftButtonStyle(active: prayer.youPrayed))

                if prayer.prayedCount > 0 {
                    Text(prayer.prayedCount == 1
                         ? "1 prayer"
                         : "\(prayer.prayedCount) prayers")
                        .font(.system(size: 13))
                        .foregroundStyle(Color.ink400)
                }

                Spacer()

                if prayer.replied {
                    Text("Replied")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color.sage600)
                }
            }
        }
        .padding(20)
        .card()
    }
}
