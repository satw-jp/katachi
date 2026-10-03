# CURRENT — Package G-code

- Slice経路は変更していない。独立したGUIタブと `package_gcode.py` を追加。
- Phase Bのsliced-only構造を基に、実際のBambu sliced packageから空の3MFモデルとrelationship、source 3MFからproject/plate metadataを使用。
- 13,184,604 byteの実G-code fixture: CRC PASS、150層、埋め込みSHA256一致、Bambu Studio Previewでlayer sliderとtoolpath表示。
- G-codeだけのmetadata生成はBambu Studioで拒否されたため、元の3MF設定を必須としfail closedにした。
- MINIA: `PACKAGE_RESULT.json` でCRC、674,530,071 bytes、778層、元/埋め込みSHA256一致を確認。Bambu Studio Previewで778層、Z 155.8 mm、toolpath、A1 mini、Generic PLAを確認した。`DELIVERY_READY / AUTHOR PRINT GATE`。印刷開始なし。
- 全26 unittest PASS。GUIのTk実起動smokeは、この実行環境のPythonにTcl runtimeがないため未実施。
- FOLLOW-UP: G-code以外のcontextがない場合にBambu Studioが受け入れる最小metadata集合の実証。
