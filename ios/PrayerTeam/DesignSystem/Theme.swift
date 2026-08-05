import SwiftUI

// The web app's "quiet spa" design system (app/globals.css), ported.
// Sage is the single accent; mist is the canvas; ink is text.
// Everything else is white and air.

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }

    static let sage50 = Color(hex: 0xF3F7F5)
    static let sage100 = Color(hex: 0xE4ECE9)
    static let sage200 = Color(hex: 0xCBDAD4)
    static let sage300 = Color(hex: 0xA8C0B8)
    static let sage400 = Color(hex: 0x82A399)
    static let sage500 = Color(hex: 0x64887E)
    static let sage600 = Color(hex: 0x4F6F66)
    static let sage700 = Color(hex: 0x415A53)

    static let mist50 = Color(hex: 0xF7FAFA)
    static let mist100 = Color(hex: 0xEEF3F3)
    static let mist200 = Color(hex: 0xE0E8E8)
    static let mist300 = Color(hex: 0xC9D6D6)

    static let ink300 = Color(hex: 0xA3B1B5)
    static let ink400 = Color(hex: 0x81959B)
    static let ink500 = Color(hex: 0x64787F)
    static let ink600 = Color(hex: 0x4C5E66)
    static let ink700 = Color(hex: 0x39484F)
    static let ink800 = Color(hex: 0x2A363C)
}

extension Font {
    // Serif display face standing in for the web's Fraunces (New York on
    // Apple platforms reads beautifully in light weights). Bundling Fraunces
    // itself is a Phase-10 polish item.
    static func display(_ size: CGFloat, weight: Font.Weight = .light) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
}

// The web's .card: white, hairline mist border, 24pt radius, soft layered
// shadow.
struct CardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color.mist200, lineWidth: 1)
            )
            .shadow(color: Color.ink800.opacity(0.03), radius: 1, y: 1)
            .shadow(color: Color.ink800.opacity(0.06), radius: 12, y: 8)
    }
}

// The web's "rise" entrance: fade + 10pt lift with the signature easing
// curve, staggered per card.
struct RiseIn: ViewModifier {
    let delay: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 10)
            .onAppear {
                withAnimation(.timingCurve(0.22, 1, 0.36, 1, duration: 0.6).delay(delay)) {
                    shown = true
                }
            }
    }
}

extension View {
    func card() -> some View { modifier(CardModifier()) }
    func riseIn(delay: Double = 0) -> some View { modifier(RiseIn(delay: delay)) }
}

// Pill buttons, matching .btn-primary / .btn-soft.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(.white)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(Color.sage600, in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

struct SoftButtonStyle: ButtonStyle {
    var active = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(active ? Color.white : Color.sage700)
            .padding(.vertical, 8)
            .padding(.horizontal, 16)
            .background(active ? Color.sage600 : Color.sage100, in: Capsule())
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
