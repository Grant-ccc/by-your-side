"""Rebuild the portable HTML from the prototype source files."""
from pathlib import Path

root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + (root / 'style.css').read_text(encoding='utf-8') + '</style>')
html = html.replace('<script src="app.js"></script>', '<script>' + (root / 'app.js').read_text(encoding='utf-8') + '</script>')
(root / '在你身边-原型.html').write_text(html, encoding='utf-8')
print('Standalone prototype rebuilt.')
