import SwiftUI

struct LoginView: View {
    @Environment(AuthStore.self) private var auth
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 8) {
                Text("WELCOME BACK")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(3)
                    .foregroundStyle(Color.sage500)
                Text("Prayer Team")
                    .font(.display(34))
                    .foregroundStyle(Color.ink800)
                Text("Sign in to see what your church is praying for.")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.ink400)
                    .multilineTextAlignment(.center)
            }
            .padding(.bottom, 32)
            .riseIn()

            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Email")
                        .font(.system(size: 13))
                        .foregroundStyle(Color.ink600)
                    TextField("you@example.com", text: $email)
                        .textFieldStyle(.plain)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(.vertical, 10)
                        .padding(.horizontal, 14)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.mist300, lineWidth: 1))
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Password")
                        .font(.system(size: 13))
                        .foregroundStyle(Color.ink600)
                    SecureField("••••••••", text: $password)
                        .textFieldStyle(.plain)
                        .textContentType(.password)
                        .padding(.vertical, 10)
                        .padding(.horizontal, 14)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.mist300, lineWidth: 1))
                }

                if let error = auth.signInError {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(Color.red.opacity(0.8))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                Button {
                    Task { await auth.signIn(email: email, password: password) }
                } label: {
                    Text(auth.busy ? "Signing in…" : "Sign in")
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(auth.busy || email.isEmpty || password.isEmpty)
                .opacity(auth.busy || email.isEmpty || password.isEmpty ? 0.5 : 1)
            }
            .padding(28)
            .card()
            .riseIn(delay: 0.1)

            Spacer()
            Spacer()
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.mist50.ignoresSafeArea())
    }
}
