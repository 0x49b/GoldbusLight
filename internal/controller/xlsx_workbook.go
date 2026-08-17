package controller

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

type xlsxSheet struct {
	Name      string
	Headers   []string
	Rows      [][]string
	ColWidths []float64
}

func encodeXLSX(sheets []xlsxSheet) ([]byte, error) {
	if len(sheets) == 0 {
		return nil, fmt.Errorf("xlsx: at least one sheet is required")
	}

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	add := func(name, body string) error {
		h := &zip.FileHeader{Name: name, Method: zip.Deflate}
		w, err := zw.CreateHeader(h)
		if err != nil {
			return err
		}
		_, err = w.Write([]byte(body))
		return err
	}

	usedNames := make(map[string]struct{}, len(sheets))
	for i := range sheets {
		sheets[i].Name = uniqueSheetName(sheets[i].Name, i+1, usedNames)
	}

	if err := add("[Content_Types].xml", xlsxContentTypes(len(sheets))); err != nil {
		return nil, err
	}
	if err := add("_rels/.rels", xlsxRootRels()); err != nil {
		return nil, err
	}
	if err := add("xl/workbook.xml", xlsxWorkbook(sheets)); err != nil {
		return nil, err
	}
	if err := add("xl/_rels/workbook.xml.rels", xlsxWorkbookRels(len(sheets))); err != nil {
		return nil, err
	}
	if err := add("xl/styles.xml", xlsxStyles()); err != nil {
		return nil, err
	}
	for i, sheet := range sheets {
		name := fmt.Sprintf("xl/worksheets/sheet%d.xml", i+1)
		if err := add(name, xlsxWorksheet(sheet)); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func uniqueSheetName(name string, index int, used map[string]struct{}) string {
	base := sanitizeSheetName(name, index)
	candidate := base
	n := 2
	for {
		if _, exists := used[strings.ToLower(candidate)]; !exists {
			used[strings.ToLower(candidate)] = struct{}{}
			return candidate
		}
		suffix := fmt.Sprintf(" (%d)", n)
		trimmed := base
		if len(trimmed)+len(suffix) > 31 {
			trimmed = strings.TrimSpace(trimmed[:31-len(suffix)])
		}
		candidate = trimmed + suffix
		n++
	}
}

func sanitizeSheetName(name string, index int) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Sprintf("Sheet%d", index)
	}
	replacer := strings.NewReplacer(":", " ", "\\", " ", "/", " ", "?", " ", "*", " ", "[", " ", "]", " ")
	name = strings.Join(strings.Fields(replacer.Replace(name)), " ")
	runes := []rune(name)
	if len(runes) > 31 {
		name = strings.TrimSpace(string(runes[:31]))
	}
	if name == "" {
		return fmt.Sprintf("Sheet%d", index)
	}
	return name
}

func xlsxContentTypes(sheetCount int) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	b.WriteString(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`)
	b.WriteString(`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`)
	b.WriteString(`<Default Extension="xml" ContentType="application/xml"/>`)
	b.WriteString(`<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`)
	b.WriteString(`<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`)
	for i := 1; i <= sheetCount; i++ {
		fmt.Fprintf(&b, `<Override PartName="/xl/worksheets/sheet%d.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`, i)
	}
	b.WriteString(`</Types>`)
	return b.String()
}

func xlsxRootRels() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
		`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
		`</Relationships>`
}

func xlsxWorkbook(sheets []xlsxSheet) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	b.WriteString(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`)
	b.WriteString(`<sheets>`)
	for i, sheet := range sheets {
		fmt.Fprintf(&b, `<sheet name="%s" sheetId="%d" r:id="rId%d"/>`, xmlEscapeAttr(sheet.Name), i+1, i+1)
	}
	b.WriteString(`</sheets></workbook>`)
	return b.String()
}

func xlsxWorkbookRels(sheetCount int) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	b.WriteString(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`)
	for i := 1; i <= sheetCount; i++ {
		fmt.Fprintf(&b, `<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>`, i, i)
	}
	fmt.Fprintf(&b, `<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`, sheetCount+1)
	b.WriteString(`</Relationships>`)
	return b.String()
}

func xlsxStyles() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
		`<fonts count="2">` +
		`<font><sz val="11"/><name val="Calibri"/></font>` +
		`<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
		`</fonts>` +
		`<fills count="3">` +
		`<fill><patternFill patternType="none"/></fill>` +
		`<fill><patternFill patternType="gray125"/></fill>` +
		`<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/><bgColor indexed="64"/></patternFill></fill>` +
		`</fills>` +
		`<borders count="1"><border/></borders>` +
		`<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
		`<cellXfs count="2">` +
		`<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
		`<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
		`</cellXfs>` +
		`</styleSheet>`
}

func xlsxWorksheet(sheet xlsxSheet) string {
	cols := len(sheet.Headers)
	for _, row := range sheet.Rows {
		if len(row) > cols {
			cols = len(row)
		}
	}
	if cols < 1 {
		cols = 1
	}
	lastCol := xlsxColName(cols)
	lastRow := 1 + len(sheet.Rows)
	filterRef := fmt.Sprintf("A1:%s%d", lastCol, lastRow)

	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	b.WriteString(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`)
	b.WriteString(`<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`)
	b.WriteString(`<cols>`)
	for i := 1; i <= cols; i++ {
		width := 14.0
		if i-1 < len(sheet.ColWidths) && sheet.ColWidths[i-1] > 0 {
			width = sheet.ColWidths[i-1]
		}
		fmt.Fprintf(&b, `<col min="%d" max="%d" width="%s" customWidth="1"/>`, i, i, strconv.FormatFloat(width, 'f', 2, 64))
	}
	b.WriteString(`</cols><sheetData>`)

	writeRow := func(rowIdx int, values []string, styleID int) {
		fmt.Fprintf(&b, `<row r="%d">`, rowIdx)
		for c := 0; c < cols; c++ {
			value := ""
			if c < len(values) {
				value = values[c]
			}
			ref := xlsxColName(c+1) + strconv.Itoa(rowIdx)
			fmt.Fprintf(&b, `<c r="%s" t="inlineStr" s="%d"><is><t xml:space="preserve">%s</t></is></c>`, ref, styleID, xmlEscapeText(sanitizeCellText(value)))
		}
		b.WriteString(`</row>`)
	}

	writeRow(1, sheet.Headers, 1)
	for i, row := range sheet.Rows {
		writeRow(i+2, row, 0)
	}
	b.WriteString(`</sheetData>`)
	fmt.Fprintf(&b, `<autoFilter ref="%s"/>`, filterRef)
	b.WriteString(`<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>`)
	b.WriteString(`</worksheet>`)
	return b.String()
}

func xlsxColName(index int) string {
	if index < 1 {
		index = 1
	}
	var letters []byte
	for index > 0 {
		index--
		letters = append([]byte{byte('A' + index%26)}, letters...)
		index /= 26
	}
	return string(letters)
}

func sanitizeCellText(s string) string {
	if s == "" {
		return s
	}
	return strings.Map(func(r rune) rune {
		if r == '\t' || r == '\n' || r == '\r' {
			return ' '
		}
		if unicode.IsPrint(r) {
			return r
		}
		return -1
	}, s)
}

func xmlEscapeText(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

func xmlEscapeAttr(s string) string {
	return xmlEscapeText(s)
}
