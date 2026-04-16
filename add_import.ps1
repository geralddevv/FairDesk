$file = "routes\fairdesk_route.js"
$content = Get-Content $file -Raw
$old = 'import Counter from "../models/system/counter.js";'
$new = "import Counter from `"../models/system/counter.js`";`r`nimport Sample from `"../models/inventory/sample.js`";"
$updated = $content.Replace($old, $new)
[System.IO.File]::WriteAllText((Resolve-Path $file), $updated, [System.Text.Encoding]::UTF8)
Write-Host "Done"
