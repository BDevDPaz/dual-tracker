import re, sys
PROP_NAMES = r"label|title|placeholder|message|description|hint|accessibilityLabel|accessibilityHint"
def extract(path):
    out = []
    lines = open(path, encoding="utf-8").read().splitlines()
    for i, ln in enumerate(lines, 1):
        if "t(" in ln:
            continue
        for m in re.finditer(rf"\b({PROP_NAMES})\s*=\s*[\"']([^\"']+)[\"']", ln):
            s = m.group(2).strip()
            if len(s) >= 2 and re.search(r"[A-Za-z]", s):
                out.append((i, "prop:" + m.group(1), s))
        for m in re.finditer(r">([^<>{{}}]+)<", ln):
            s = m.group(1).strip()
            if len(s) >= 2 and re.search(r"[A-Za-z]", s) and not re.match(r"^[\d\s.,:;!?()/-]+$", s):
                out.append((i, "jsx", s))
        s = ln.strip()
        if (len(s) >= 3 and re.search(r"[A-Za-z]", s)
            and not s.startswith(("<", "{{", "}}", "/", "*", "import ", "export ", "const ", "let ", "var ", "return", "case ", "if ", "else"))
            and not re.search(r"[{{}};:]$", s)
            and '"' not in s and "'" not in s and "`" not in s
            and not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", s)):
            out.append((i, "line", s))
        for m in re.finditer(r"(?:Alert\.alert|showToast|ToastAndroid\.show)\(\s*[\"']([^\"']+)[\"']", ln):
            s = m.group(1).strip()
            if len(s) >= 2:
                out.append((i, "call", s))
        for m in re.finditer(r"`([^`]*[A-Za-z][^`]*)`", ln):
            s = m.group(1).strip()
            if len(s) >= 4 and "${" in s:
                out.append((i, "tpl", s))
    return out
for path in sys.argv[1:]:
    for (lineno, kind, s) in extract(path):
        print(f"{path}\t{lineno}\t{kind}\t{s.replace(chr(9), ' ')}")
