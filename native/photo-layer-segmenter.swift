import AppKit
import CoreImage
import Foundation
import Vision

enum SegmenterError: Error, CustomStringConvertible {
    case usage
    case unsupported
    case unreadableImage
    case noForeground
    case encodingFailed

    var description: String {
        switch self {
        case .usage: return "usage: photo-layer-segmenter <input> <output> [foreground|person|instances] [focus-x focus-y focus-width focus-height]"
        case .unsupported: return "foreground instance segmentation requires macOS 14 or later"
        case .unreadableImage: return "unable to read input image"
        case .noForeground: return "no foreground instance detected"
        case .encodingFailed: return "unable to encode segmented PNG"
        }
    }
}

enum SegmentTarget: String {
    case foreground
    case person
    case instances
}

struct FocusRect {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
}

struct InstanceBounds: Codable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let area: Int
}

func opaqueBounds(_ image: CGImage) -> InstanceBounds? {
    let width = image.width
    let height = image.height
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    guard let context = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return nil }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    var minX = width
    var minY = height
    var maxX = -1
    var maxY = -1
    var area = 0
    for y in 0..<height {
        for x in 0..<width where pixels[(y * width + x) * 4 + 3] >= 32 {
            area += 1
            minX = min(minX, x)
            minY = min(minY, y)
            maxX = max(maxX, x)
            maxY = max(maxY, y)
        }
    }
    guard area > 0 else { return nil }
    return InstanceBounds(
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        area: area
    )
}

func detectedForegroundInstances(from cgImage: CGImage) throws -> [InstanceBounds] {
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])
    guard let observation = request.results?.first else { throw SegmenterError.noForeground }
    let context = CIContext(options: [.useSoftwareRenderer: false])
    var instances: [InstanceBounds] = try observation.allInstances.compactMap { instance in
        let buffer = try observation.generateMaskedImage(
            ofInstances: IndexSet(integer: instance),
            from: handler,
            croppedToInstancesExtent: false
        )
        let image = CIImage(cvPixelBuffer: buffer)
        guard let output = context.createCGImage(image, from: image.extent) else { return nil }
        return opaqueBounds(output)
    }
    let saliencyRequests: [VNImageBasedRequest] = [
        VNGenerateObjectnessBasedSaliencyImageRequest(),
        VNGenerateAttentionBasedSaliencyImageRequest()
    ]
    try handler.perform(saliencyRequests)
    for request in saliencyRequests {
        let observation: VNSaliencyImageObservation?
        if let objectness = request as? VNGenerateObjectnessBasedSaliencyImageRequest {
            observation = objectness.results?.first
        } else if let attention = request as? VNGenerateAttentionBasedSaliencyImageRequest {
            observation = attention.results?.first
        } else {
            observation = nil
        }
        for object in observation?.salientObjects ?? [] {
            let box = object.boundingBox
            let x = max(0, Int((box.minX * Double(cgImage.width)).rounded()))
            let y = max(0, Int(((1 - box.maxY) * Double(cgImage.height)).rounded()))
            let width = min(cgImage.width - x, max(1, Int((box.width * Double(cgImage.width)).rounded())))
            let height = min(cgImage.height - y, max(1, Int((box.height * Double(cgImage.height)).rounded())))
            instances.append(InstanceBounds(x: x, y: y, width: width, height: height, area: width * height))
        }
    }
    return instances
}

func alphaScore(
    _ image: CGImage,
    focus: FocusRect?
) -> (focusPixels: Int, centerDistance: Int, centerPixels: Int, area: Int) {
    let width = image.width
    let height = image.height
    var pixels = [UInt8](repeating: 0, count: width * height * 4)
    guard let context = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return (0, .max, 0, 0) }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    let target = focus ?? FocusRect(x: 0, y: 0, width: width, height: height)
    let centerX = target.x + target.width / 2
    let centerY = target.y + target.height / 2
    let centerRadiusX = max(1, target.width / 8)
    let centerRadiusY = max(1, target.height / 8)
    var minimumDistance = Int.max
    var focusPixels = 0
    var centerPixels = 0
    var area = 0
    for y in 0..<height {
        for x in 0..<width where pixels[(y * width + x) * 4 + 3] >= 32 {
            area += 1
            let dx = x - centerX
            let dy = y - centerY
            minimumDistance = min(minimumDistance, dx * dx + dy * dy)
            if x >= target.x && x < target.x + target.width
                && y >= target.y && y < target.y + target.height {
                focusPixels += 1
            }
            if abs(dx) <= centerRadiusX && abs(dy) <= centerRadiusY {
                centerPixels += 1
            }
        }
    }
    return (focusPixels, minimumDistance, centerPixels, area)
}

func selectedInstances(
    from observation: VNInstanceMaskObservation,
    handler: VNImageRequestHandler,
    focus: FocusRect?
) throws -> IndexSet {
    var bestInstance: Int?
    var bestScore: (focusPixels: Int, centerDistance: Int, centerPixels: Int, area: Int)?
    var candidates: [(
        instance: Int,
        score: (focusPixels: Int, centerDistance: Int, centerPixels: Int, area: Int)
    )] = []
    for instance in observation.allInstances {
        let candidateBuffer = try observation.generateMaskedImage(
            ofInstances: IndexSet(integer: instance),
            from: handler,
            croppedToInstancesExtent: false
        )
        let candidateImage = CIImage(cvPixelBuffer: candidateBuffer)
        let context = CIContext(options: [.useSoftwareRenderer: false])
        guard let candidate = context.createCGImage(candidateImage, from: candidateImage.extent) else {
            continue
        }
        let score = alphaScore(candidate, focus: focus)
        guard score.area > 0 else { continue }
        candidates.append((instance, score))
        if let current = bestScore {
            let isBetter = score.centerPixels != current.centerPixels
                ? score.centerPixels > current.centerPixels
                : score.focusPixels != current.focusPixels
                    ? score.focusPixels > current.focusPixels
                : score.centerDistance != current.centerDistance
                    ? score.centerDistance < current.centerDistance
                    : score.area > current.area
            if !isBetter { continue }
        }
        bestInstance = instance
        bestScore = score
    }
    guard let bestInstance else { throw SegmenterError.noForeground }
    guard let focus else { return IndexSet(integer: bestInstance) }
    let minimumFragmentArea = max(32, focus.width * focus.height / 500)
    let selected = candidates.compactMap { candidate -> Int? in
        if candidate.instance == bestInstance { return candidate.instance }
        let overlap = Double(candidate.score.focusPixels) / Double(candidate.score.area)
        return candidate.score.focusPixels >= minimumFragmentArea && overlap >= 0.55
            ? candidate.instance
            : nil
    }
    return IndexSet(selected)
}

func semanticPersonMask(from cgImage: CGImage) throws -> CIImage {
    let request = VNGeneratePersonSegmentationRequest()
    request.qualityLevel = .accurate
    request.outputPixelFormat = kCVPixelFormatType_OneComponent8
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])
    guard let observation = request.results?.first else { throw SegmenterError.noForeground }
    let rawMask = CIImage(cvPixelBuffer: observation.pixelBuffer)
    let targetWidth = CGFloat(cgImage.width)
    let targetHeight = CGFloat(cgImage.height)
    return rawMask
        .transformed(by: CGAffineTransform(
            scaleX: targetWidth / rawMask.extent.width,
            y: targetHeight / rawMask.extent.height
        ))
        .cropped(to: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))
}

func applyMask(_ mask: CIImage, to image: CIImage) throws -> CGImage {
    guard let filter = CIFilter(name: "CIBlendWithMask") else {
        throw SegmenterError.encodingFailed
    }
    filter.setValue(image, forKey: kCIInputImageKey)
    filter.setValue(CIImage(color: .clear).cropped(to: image.extent), forKey: kCIInputBackgroundImageKey)
    filter.setValue(mask, forKey: kCIInputMaskImageKey)
    guard
        let output = filter.outputImage,
        let cgOutput = CIContext(options: [.useSoftwareRenderer: false])
            .createCGImage(output, from: image.extent)
    else { throw SegmenterError.encodingFailed }
    return cgOutput
}

func maskedForeground(
    from cgImage: CGImage,
    target: SegmentTarget,
    focus: FocusRect?
) throws -> CGImage {
    if target == .person {
        return try applyMask(semanticPersonMask(from: cgImage), to: CIImage(cgImage: cgImage))
    }
    let request: VNImageBasedRequest
    switch target {
    case .foreground:
        request = VNGenerateForegroundInstanceMaskRequest()
    case .person:
        throw SegmenterError.noForeground
    case .instances:
        throw SegmenterError.noForeground
    }
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])
    let observation: VNInstanceMaskObservation?
    if let foregroundRequest = request as? VNGenerateForegroundInstanceMaskRequest {
        observation = foregroundRequest.results?.first
    } else if let personRequest = request as? VNGeneratePersonInstanceMaskRequest {
        observation = personRequest.results?.first
    } else {
        observation = nil
    }
    guard let observation else { throw SegmenterError.noForeground }
    let instances = try selectedInstances(from: observation, handler: handler, focus: focus)
    let pixelBuffer = try observation.generateMaskedImage(
        ofInstances: instances,
        from: handler,
        croppedToInstancesExtent: false
    )
    let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let output = context.createCGImage(ciImage, from: ciImage.extent) else {
        throw SegmenterError.encodingFailed
    }
    if let personMask = try? semanticPersonMask(from: cgImage) {
        return try applyMask(
            personMask.applyingFilter("CIColorInvert"),
            to: CIImage(cgImage: output)
        )
    }
    return output
}

func run() throws {
    guard [3, 4, 8].contains(CommandLine.arguments.count) else {
        throw SegmenterError.usage
    }
    guard #available(macOS 14.0, *) else { throw SegmenterError.unsupported }

    let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
    let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
    let target = CommandLine.arguments.count == 4
        ? SegmentTarget(rawValue: CommandLine.arguments[3])
        : CommandLine.arguments.count == 8
            ? SegmentTarget(rawValue: CommandLine.arguments[3])
            : .foreground
    guard let target else { throw SegmenterError.usage }
    let focus: FocusRect?
    if CommandLine.arguments.count == 8 {
        guard
            let x = Int(CommandLine.arguments[4]),
            let y = Int(CommandLine.arguments[5]),
            let width = Int(CommandLine.arguments[6]),
            let height = Int(CommandLine.arguments[7]),
            x >= 0, y >= 0, width > 0, height > 0
        else { throw SegmenterError.usage }
        focus = FocusRect(x: x, y: y, width: width, height: height)
    } else {
        focus = nil
    }
    guard
        let image = NSImage(contentsOf: inputURL),
        let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else { throw SegmenterError.unreadableImage }

    if let focus, focus.x + focus.width > cgImage.width || focus.y + focus.height > cgImage.height {
        throw SegmenterError.usage
    }
    if target == .instances {
        let instances = try detectedForegroundInstances(from: cgImage)
        let data = try JSONEncoder().encode(instances)
        try data.write(to: outputURL, options: .atomic)
        return
    }
    let output = try maskedForeground(from: cgImage, target: target, focus: focus)
    guard let png = NSBitmapImageRep(cgImage: output).representation(using: .png, properties: [:])
    else { throw SegmenterError.encodingFailed }
    try png.write(to: outputURL, options: .atomic)
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}
