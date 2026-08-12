#!/usr/bin/env swift
// App Store Connect rejects screenshots that carry an alpha channel, and
// `xcrun simctl io booted screenshot` always writes one. Redraw each PNG onto
// an opaque white context and write it back — lossless, unlike a round trip
// through JPEG.
//
//   swift ios/screenshots/flatten.swift ios/screenshots/*.png

import AppKit
import CoreGraphics
import Foundation

let paths = CommandLine.arguments.dropFirst()
guard !paths.isEmpty else {
    print("usage: flatten.swift <file.png>…")
    exit(2)
}

var failed = false

for path in paths {
    let url = URL(fileURLWithPath: path)
    guard
        let source = CGImageSourceCreateWithURL(url as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
        print("✗ \(url.lastPathComponent) — could not read")
        failed = true
        continue
    }

    guard let context = CGContext(
        data: nil,
        width: image.width,
        height: image.height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        // noneSkipLast is what makes the output opaque.
        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else {
        print("✗ \(url.lastPathComponent) — could not create context")
        failed = true
        continue
    }

    let rect = CGRect(x: 0, y: 0, width: image.width, height: image.height)
    context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    context.fill(rect)
    context.draw(image, in: rect)

    guard
        let flattened = context.makeImage(),
        let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)
    else {
        print("✗ \(url.lastPathComponent) — could not write")
        failed = true
        continue
    }
    CGImageDestinationAddImage(dest, flattened, nil)
    CGImageDestinationFinalize(dest)
    print("✓ \(url.lastPathComponent) — \(image.width)×\(image.height), opaque")
}

exit(failed ? 1 : 0)
