import Foundation

struct APIError: Error, LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

private struct ServerError: Decodable {
    let error: String?
}

// Thin client for the app's own Next.js API. Every call carries the Supabase
// access token; the server validates it and applies the same row-level
// security a web session gets.
final class APIClient {
    private let auth: AuthStore
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(auth: AuthStore) {
        self.auth = auth

        decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoNoFraction = ISO8601DateFormatter()
        decoder.dateDecodingStrategy = .custom { d in
            let s = try d.singleValueContainer().decode(String.self)
            if let date = iso.date(from: s) ?? isoNoFraction.date(from: s) { return date }
            throw DecodingError.dataCorrupted(.init(
                codingPath: d.codingPath, debugDescription: "Unrecognized date: \(s)"))
        }

        encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        try await send("GET", path, body: Optional<String>.none)
    }

    func post<T: Decodable>(_ path: String, body: (some Encodable)? = Optional<String>.none) async throws -> T {
        try await send("POST", path, body: body)
    }

    func patch<T: Decodable>(_ path: String, body: some Encodable) async throws -> T {
        try await send("PATCH", path, body: body)
    }

    func delete<T: Decodable>(_ path: String) async throws -> T {
        try await send("DELETE", path, body: Optional<String>.none)
    }

    private func send<T: Decodable>(
        _ method: String,
        _ path: String,
        body: (some Encodable)?
    ) async throws -> T {
        var request = URLRequest(url: Config.apiBase.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(try await auth.accessToken())", forHTTPHeaderField: "Authorization")
        if let body {
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        guard (200..<300).contains(status) else {
            let message = (try? decoder.decode(ServerError.self, from: data))?.error
            throw APIError(status: status, message: message ?? "Something went wrong. Please try again.")
        }
        return try decoder.decode(T.self, from: data)
    }
}
