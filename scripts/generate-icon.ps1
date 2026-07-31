param([string]$OutputPath = (Join-Path $PSScriptRoot '..\build\icon.png'))

Add-Type -AssemblyName System.Drawing

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$bitmap = [System.Drawing.Bitmap]::new(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$backgroundPath = New-RoundedPath 20 20 472 472 116
$backgroundBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Point]::new(20, 20),
  [System.Drawing.Point]::new(492, 492),
  [System.Drawing.ColorTranslator]::FromHtml('#151e38'),
  [System.Drawing.ColorTranslator]::FromHtml('#080d19')
)
$graphics.FillPath($backgroundBrush, $backgroundPath)

function Draw-Link([System.Drawing.Graphics]$canvas, [float]$centerX, [float]$angle, [string]$color) {
  $state = $canvas.Save()
  $canvas.TranslateTransform($centerX, 256)
  $canvas.RotateTransform($angle)
  $linkPath = New-RoundedPath -82 -168 164 336 78
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($color), 34)
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $canvas.DrawPath($pen, $linkPath)
  $pen.Dispose()
  $linkPath.Dispose()
  $canvas.Restore($state)
}

Draw-Link $graphics 209 -18 '#7d8cff'
Draw-Link $graphics 303 18 '#55c7f4'
$bridgePen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#78aafa'), 26)
$bridgePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$bridgePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($bridgePen, 184, 256, 328, 256)

$target = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
$bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
$bridgePen.Dispose()
$backgroundBrush.Dispose()
$backgroundPath.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
Write-Output $target
