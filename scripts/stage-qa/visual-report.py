"""A compact visual review of disposable browser fixtures, also readable via CI logs."""
import base64
from pathlib import Path
from PIL import Image, ImageDraw

root = Path('/tmp/diart-scenography-results')
names = ['scene-client-desktop.png', 'presentation-client.png', 'pdf-render.png',
         'library-light.png', 'library-tablet.png', 'library-phone.png', 'scene-phone.png', 'failure.png']
paths = [root / name for name in names if (root / name).exists()]
if not paths:
    paths = list(Path('/tmp/diart-stage-results').glob('*.png'))[-4:]
if paths:
    canvas = Image.new('RGB', (1440, 550 * ((len(paths) + 1) // 2)), '#dce5e9')
    draw = ImageDraw.Draw(canvas)
    for index, path in enumerate(paths):
        picture = Image.open(path).convert('RGB')
        picture.thumbnail((700, 506))
        x, y = (index % 2) * 720, (index // 2) * 550
        draw.text((x + 10, y + 10), path.name, fill='#203e49')
        canvas.paste(picture, (x + (720 - picture.width) // 2, y + 34))
    root.mkdir(parents=True, exist_ok=True)
    target = root / 'visual-review.jpg'
    canvas.save(target, quality=80, optimize=True)
    print('DIART_VISUAL_REVIEW_BEGIN')
    print(base64.b64encode(target.read_bytes()).decode())
    print('DIART_VISUAL_REVIEW_END')
