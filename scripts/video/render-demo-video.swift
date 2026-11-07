// Builds the demo video (MP4) from docs/proof/demo-timing.json, which holds the REAL output of `npm run demo` with the time each
// line appeared. The typing of the command and the title cards are added; the output and its timing are the recorded run.
// Usage: swiftc -O scripts/video/render-demo-video.swift -o /tmp/render-demo-video && /tmp/render-demo-video <timing.json> <out.mp4>
import AVFoundation
import CoreGraphics
import CoreText
import Foundation

struct Line: Decodable { let t: Int; let line: String }
struct Timing: Decodable { let total_ms: Int; let lines: [Line] }

let args = CommandLine.arguments
guard args.count >= 3 else { print("Usage: render-demo-video <timing.json> <out.mp4>"); exit(1) }
let timing = try JSONDecoder().decode(Timing.self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let outURL = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: outURL)

let W = 1280, H = 720, FPS = 15
func rgb(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: a)
}
let bg = rgb(0x1e1f26), bar = rgb(0x2b2d37), fg: UInt32 = 0xe6e8ef
let palette: [Int: UInt32] = [31: 0xff6b6b, 32: 0x69db7c, 33: 0xffd43b, 36: 0x66d9ef, 90: 0x8a90a5]

struct Run { var text: String; var color: UInt32; var bold: Bool; var dim: Bool }
var sgr = (color: fg, bold: false, dim: false) // colour state carries over from one line to the next, like a real terminal

func parse(_ line: String) -> [Run] {
    var runs: [Run] = []
    var buffer = ""
    func flush() { if !buffer.isEmpty { runs.append(Run(text: buffer, color: sgr.color, bold: sgr.bold, dim: sgr.dim)); buffer = "" } }
    let chars = Array(line)
    var i = 0
    while i < chars.count {
        if chars[i] == "\u{1b}", i + 1 < chars.count, chars[i + 1] == "[" {
            var j = i + 2
            var code = ""
            while j < chars.count, chars[j] != "m" { code.append(chars[j]); j += 1 }
            flush()
            for part in code.split(separator: ";").compactMap({ Int($0) }) + (code.isEmpty ? [0] : []) {
                switch part {
                case 0: sgr = (fg, false, false)
                case 1: sgr.bold = true
                case 2: sgr.dim = true
                case 22: sgr.bold = false; sgr.dim = false
                case 39: sgr.color = fg
                default: if let c = palette[part] { sgr.color = c }
                }
            }
            i = j + 1
        } else { buffer.append(chars[i]); i += 1 }
    }
    flush()
    return runs
}
let parsed: [[Run]] = timing.lines.map { parse($0.line) }

func font(_ size: CGFloat, bold: Bool = false) -> CTFont {
    CTFontCreateWithName((bold ? "Menlo-Bold" : "Menlo-Regular") as CFString, size, nil)
}
func draw(_ ctx: CGContext, _ text: String, x: CGFloat, top: CGFloat, size: CGFloat, color: UInt32, alpha: CGFloat = 1, bold: Bool = false, center: Bool = false) {
    let attrs: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font(size, bold: bold),
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): rgb(color, alpha),
    ]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
    var px = x
    if center { px = x - CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil)) / 2 }
    ctx.textPosition = CGPoint(x: px, y: CGFloat(H) - top - size)
    CTLineDraw(line, ctx)
}

let charW = CTFontGetAdvancesForGlyphs(font(21), .horizontal, [CTFontGetGlyphWithName(font(21), "M" as CFString)], nil, 1) == 0 ? 12.6 : {
    var g = CTFontGetGlyphWithName(font(21), "M" as CFString)
    var adv = CGSize.zero
    CTFontGetAdvancesForGlyphs(font(21), .horizontal, &g, &adv, 1)
    return adv.width
}()
let lineH: CGFloat = 27
let winX: CGFloat = 40, winTop: CGFloat = 36, winW = CGFloat(W) - 80, winH = CGFloat(H) - 72
let textLeft = winX + 24, textTop = winTop + 52
let visibleLines = Int((winH - 70) / lineH)

let introEnd = 3.2, typeStart = 3.6, typeCPS = 18.0
let command = "npm run demo"
let typeEnd = typeStart + Double(command.count) / typeCPS
let outputStart = typeEnd + 0.7
let outputEnd = outputStart + Double(timing.total_ms) / 1000
let termEnd = outputEnd + 2.6
let total = termEnd + 5.2

func card(_ ctx: CGContext, title: String, size: CGFloat = 76, lines: [(String, UInt32, CGFloat)], fade: CGFloat) {
    draw(ctx, title, x: CGFloat(W) / 2, top: 230, size: size, color: 0xffffff, alpha: fade, bold: true, center: true)
    var top: CGFloat = 340
    for (text, color, size) in lines {
        draw(ctx, text, x: CGFloat(W) / 2, top: top, size: size, color: color, alpha: fade, center: true)
        top += size + 18
    }
}

func render(_ ctx: CGContext, at t: Double) {
    ctx.setFillColor(bg); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    if t < introEnd {
        let fade = CGFloat(min(1, t / 0.5, (introEnd - t) / 0.4 + 0.0001))
        card(ctx, title: "bharat-mcp", lines: [
            ("Accurate Indian GST, PAN, pincode and compliance data", 0xe6e8ef, 28),
            ("for your AI agent. An MCP server that works offline.", 0xe6e8ef, 28),
            ("Real output, recorded from the built server over stdio.", 0x8a90a5, 22),
        ], fade: max(0, fade))
        return
    }
    if t >= termEnd {
        let fade = CGFloat(min(1, (t - termEnd) / 0.5))
        card(ctx, title: "npx -y @llakshit/bharat-mcp", size: 58, lines: [
            ("github.com/lllakshit/bharat-mcp", 0x66d9ef, 30),
            ("Checks format and checksums. It does not prove a GSTIN is registered.", 0xe6e8ef, 22),
            ("Data: pincodes from GeoNames (CC BY 4.0). Holidays: DoPT orders.", 0x8a90a5, 20),
        ], fade: fade)
        return
    }
    // The terminal window
    ctx.setFillColor(rgb(0x1e1f26)); ctx.fill(CGRect(x: winX, y: CGFloat(H) - winTop - winH, width: winW, height: winH))
    ctx.setFillColor(bar); ctx.fill(CGRect(x: winX, y: CGFloat(H) - winTop - 40, width: winW, height: 40))
    for (i, c) in [0xff5f56, 0xffbd2e, 0x27c93f].enumerated() {
        ctx.setFillColor(rgb(UInt32(c))); ctx.fillEllipse(in: CGRect(x: winX + 22 + CGFloat(i) * 26, y: CGFloat(H) - winTop - 28, width: 14, height: 14))
    }
    draw(ctx, "bharat-mcp — zsh", x: winX + winW / 2, top: winTop + 11, size: 16, color: 0x9aa0b4, center: true)

    var rows: [[Run]] = []
    let typedCount = max(0, min(command.count, Int((t - typeStart) * typeCPS)))
    var prompt = [Run(text: "$ ", color: 0x69db7c, bold: true, dim: false)]
    if t >= typeStart { prompt.append(Run(text: String(command.prefix(typedCount)), color: fg, bold: false, dim: false)) }
    rows.append(prompt)
    if t >= outputStart {
        let elapsedMs = Int((t - outputStart) * 1000)
        for (i, entry) in timing.lines.enumerated() where entry.t <= elapsedMs { rows.append(parsed[i]) }
    }
    let shown = rows.suffix(visibleLines)
    let cursorOn = Int(t * 2) % 2 == 0
    for (row, runs) in shown.enumerated() {
        var col = 0
        let top = textTop + CGFloat(row) * lineH
        for run in runs {
            draw(ctx, run.text, x: textLeft + CGFloat(col) * charW, top: top, size: 21, color: run.color, alpha: run.dim ? 0.6 : 1, bold: run.bold)
            col += run.text.count
        }
        if row == shown.count - 1, cursorOn, t < outputEnd + 1.5 {
            ctx.setFillColor(rgb(0xe6e8ef, 0.85))
            ctx.fill(CGRect(x: textLeft + CGFloat(col) * charW + 2, y: CGFloat(H) - top - 24, width: charW * 0.8, height: 24))
        }
    }
}

let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 4_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let frames = Int(total * Double(FPS))
for n in 0..<frames {
    while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    guard let buffer = pb else { fatalError("no pixel buffer") }
    CVPixelBufferLockBaseAddress(buffer, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.setShouldAntialias(true); ctx.setShouldSmoothFonts(true)
    render(ctx, at: Double(n) / Double(FPS))
    CVPixelBufferUnlockBaseAddress(buffer, [])
    adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: CMTimeScale(FPS)))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { print("FAILED: \(String(describing: writer.error))"); exit(1) }
print("Wrote \(outURL.path): \(frames) frames, \(String(format: "%.1f", total)) s")
