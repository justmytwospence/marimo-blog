"""Regenerate synthetic serialization fixtures with an installed marimo release.

This calls marimo's official HTML export template and UI serializers, not a
notebook kernel. It neither creates nor edits notebooks. Run deliberately with
uv run --with marimo==<version> python scripts/generate-export-fixtures.py.
The generated exports are test data; npm builds/tests never run this script.
"""
from hashlib import md5
from pathlib import Path

import marimo as mo
from marimo._ast.app_config import _AppConfig
from marimo._server.tokens import SkewProtectionToken
from marimo._templates import static_notebook_template

version = mo.__version__
assert version in {"0.25.0", "0.25.1", "0.25.2"}, version
root = Path(__file__).resolve().parent.parent
source = 'message = "Synthetic export: café, <tag>, & punctuation"\n'
outputs = [
    ("prose", mo.md("# Synthetic export\n\n## Résumé\n\nSaved **prose** with `code` and café.")),
    ("table", mo.ui.table([{"Name": "Ada", "Score": 0}, {"Name": "Bex", "Score": 3}], show_download=False)),
    ("tabs", mo.ui.tabs({"First": mo.md("Saved first panel"), "Second": mo.md("Saved second panel")})),
    ("accordion", mo.accordion({"Details": mo.md("Saved detail")})),
    ("stack", mo.vstack([mo.md("Stack first"), mo.md("Stack second")])),
    ("slider", mo.ui.slider(0, 10, value=0, label="Captured setting")),
    ("callout", mo.callout(mo.md("Saved note"), kind="warn")),
    ("stat", mo.stat(value=0, label="Count", caption="Saved count")),
    ("json", mo.json({"x": False})),
    ("carousel", mo.carousel([mo.md("Slide one"), mo.md("Slide two")])),
    ("math", mo.md(r"Before $x^2$ and after.\n\n$$\sqrt{x^2+1}$$")),
]
notebook_cells = []
session_cells = []
for cell_id, value in outputs:
    mime, data = value._mime_()
    notebook_cells.append({"id": cell_id, "code": None, "code_hash": None, "name": cell_id, "config": {}})
    session_cells.append({"id": cell_id, "code_hash": None, "outputs": [{"type": "data", "data": {mime: data}}], "console": []})
notebook = {"version": "1", "metadata": {"marimo_version": version}, "cells": notebook_cells}
session = {"version": "1", "metadata": {"marimo_version": version}, "cells": session_cells}
template = (Path(mo.__file__).parent / "_static" / "index.html").read_text()
for include_source in (True, False):
    code = source if include_source else ""
    html = static_notebook_template(
        html=template,
        user_config={},
        config_overrides={},
        server_token=SkewProtectionToken("synthetic-test-token"),
        app_config=_AppConfig(),
        filepath="synthetic.py",
        code=code,
        code_hash=md5(code.encode()).hexdigest(),
        session_snapshot=session,
        notebook_snapshot=notebook,
        files={},
    )
    destination = root / "test" / "fixtures" / f"marimo-{version}{'' if include_source else '-no-code'}.html"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(html)
    print(f"Generated {destination.relative_to(root)} with marimo {version}")
