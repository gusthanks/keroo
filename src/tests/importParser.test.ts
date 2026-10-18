import { describe, it, expect } from 'vitest';
import {
  parseImportFile,
  parseCsv,
  parseOfx,
  parseAmountToCents,
  detectDelimiter,
  detectDateFormat,
  parseDate,
  parseOfxDate,
  detectDecimalStyle,
  detectDateFormatDetailed,
  decodeOfxEntities,
  parseCsvRows,
} from '../core/importParser';

describe('Bank Statement Import Parser (src/core/importParser.ts)', () => {
  const accountId = 'acc_test_checking';

  describe('Amount Parsing to Integer Cents ($C in Z)', () => {
    it('parses negative Brazilian decimal values into positive cents and expense type', () => {
      const res = parseAmountToCents('-45,50');
      expect(res).toEqual({ cents: 4550, type: 'expense' });
    });

    it('parses positive Brazilian values with thousand separators into income cents', () => {
      const res = parseAmountToCents('1.250,50');
      expect(res).toEqual({ cents: 125050, type: 'income' });
    });

    it('parses international dot decimals with negative sign', () => {
      const res = parseAmountToCents('-1250.50');
      expect(res).toEqual({ cents: 125050, type: 'expense' });
    });

    it('parses parenthetical accounting negative formats', () => {
      const res = parseAmountToCents('(150,00)');
      expect(res).toEqual({ cents: 15000, type: 'expense' });
    });

    it('parses trailing negative formats', () => {
      const res = parseAmountToCents('85,20-');
      expect(res).toEqual({ cents: 8520, type: 'expense' });
    });

    it('strips currency symbols and spaces', () => {
      const res = parseAmountToCents('R$ -1.500,00');
      expect(res).toEqual({ cents: 150000, type: 'expense' });
    });

    it('respects D/C flag overrides', () => {
      const debitRes = parseAmountToCents('50,00', 'D');
      expect(debitRes).toEqual({ cents: 5000, type: 'expense' });

      const creditRes = parseAmountToCents('100,00', 'C');
      expect(creditRes).toEqual({ cents: 10000, type: 'income' });
    });

    it('eliminates IEEE 754 float rounding errors on 10.55', () => {
      const res = parseAmountToCents('10.55');
      expect(res?.cents).toBe(1055);
      expect(Number.isInteger(res?.cents)).toBe(true);
    });

    it('returns null on invalid or empty strings', () => {
      expect(parseAmountToCents('')).toBeNull();
      expect(parseAmountToCents('invalid')).toBeNull();
      expect(parseAmountToCents(null as any)).toBeNull();
    });
  });

  describe('Delimiter Auto-Detection', () => {
    it('detects comma, semicolon, tab, and pipe delimiters correctly', () => {
      expect(detectDelimiter(['date,amount,payee', '2026-10-01,10.00,Padaria'])).toBe(',');
      expect(detectDelimiter(['data;valor;historico', '2026-10-01;10,00;Padaria'])).toBe(';');
      expect(detectDelimiter(['date\tamount\tpayee', '2026-10-01\t10.00\tPadaria'])).toBe('\t');
      expect(detectDelimiter(['date|amount|payee', '2026-10-01|10.00|Padaria'])).toBe('|');
    });
  });

  describe('Date Parsing & Auto-Detection', () => {
    it('detects DD/MM/YYYY pattern when days exceed 12', () => {
      const detected = detectDateFormat(['15/10/2026', '22/10/2026', '05/10/2026']);
      expect(detected).toBe('DD/MM/YYYY');
    });

    it('detects MM/DD/YYYY pattern when months exceed 12', () => {
      const detected = detectDateFormat(['10/15/2026', '10/22/2026', '10/05/2026']);
      expect(detected).toBe('MM/DD/YYYY');
    });

    it('parses Brazilian DD/MM/YYYY dates into ISO YYYY-MM-DD', () => {
      expect(parseDate('15/10/2026', 'DD/MM/YYYY')).toBe('2026-10-15');
      expect(parseDate('01/05/2026', 'DD/MM/YYYY')).toBe('2026-05-01');
    });

    it('parses ISO YYYY-MM-DD dates directly', () => {
      expect(parseDate('2026-10-16')).toBe('2026-10-16');
    });

    it('parses OFX timestamp YYYYMMDDHHMMSS into ISO YYYY-MM-DD', () => {
      expect(parseOfxDate('20261015120000' + '[' + '-3' + ':BRT]')).toBe('2026-10-15');
      expect(parseOfxDate('20261015')).toBe('2026-10-15');
      expect(parseOfxDate('invalid')).toBeNull();
    });
  });

  describe('Brazilian Banking CSV Formats', () => {
    it('parses Nubank NuConta CSV format', () => {
      const csv = `data,valor,identificador,descricao\n15/10/2026,-45.50,652d8e41-0000-0000,Transferência enviada pelo Pix - João Silva\n16/10/2026,1500.00,652d8e42-0000-0000,Transferência recebida pelo Pix - Empresa XYZ`;
      const result = parseCsv(csv, accountId);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);

      const tx1 = result.transactions[0];
      expect(tx1.date).toBe('2026-10-15');
      expect(tx1.amountCents).toBe(4550);
      expect(tx1.type).toBe('expense');
      expect(tx1.fitid).toBe('652d8e41-0000-0000');
      expect(tx1.payee).toContain('João Silva');
      expect(tx1.importHash).toBeDefined();

      const tx2 = result.transactions[1];
      expect(tx2.date).toBe('2026-10-16');
      expect(tx2.amountCents).toBe(150000);
      expect(tx2.type).toBe('income');
    });

    it('parses Banco Inter CSV with metadata preamble and semicolon delimiter', () => {
      const csv = `Extrato Conta Corrente\nConta: 1234567-8\nPeríodo: 01/10/2026 a 15/10/2026\n\nData Lançamento;Histórico;Valor;Saldo\n01/10/2026;Pix Enviado - Jose Pereira;-150,00;3.450,00\n05/10/2026;Pix Recebido - Salario;5.000,00;8.450,00`;
      const result = parseCsv(csv, accountId);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.metadata.detectedDelimiter).toBe(';');
      expect(result.transactions[0].amountCents).toBe(15000);
      expect(result.transactions[0].type).toBe('expense');
      expect(result.transactions[1].amountCents).toBe(500000);
      expect(result.transactions[1].type).toBe('income');
    });

    it('parses Itaú CSV format', () => {
      const csv = `data;lançamento;valor;saldo\n01/10/2026;PIX TRANSF JOSE;-85,20;1.200,00\n05/10/2026;REND PAGO APLIC AUT;12,45;1.212,45`;
      const result = parseCsv(csv, accountId);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].amountCents).toBe(8520);
      expect(result.transactions[0].type).toBe('expense');
      expect(result.transactions[1].amountCents).toBe(1245);
      expect(result.transactions[1].type).toBe('income');
    });

    it('parses CSV with separate Outflow and Inflow columns', () => {
      const csv = `Date,Payee,Outflow,Inflow\n2026-10-10,Supermercado,120.50,\n2026-10-12,Salario,,3500.00`;
      const result = parseCsv(csv, accountId);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].type).toBe('expense');
      expect(result.transactions[0].amountCents).toBe(12050);
      expect(result.transactions[1].type).toBe('income');
      expect(result.transactions[1].amountCents).toBe(350000);
    });

    it('handles quotes with commas inside fields and escaped quotes', () => {
      const csv = `data,valor,descricao\n10/10/2026,-55.00,"Padaria, Café & Cia"\n11/10/2026,-30.00,"Livraria ""O Saber"""`;
      const result = parseCsv(csv, accountId);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].payee).toBe('Padaria, Café & Cia');
      expect(result.transactions[1].payee).toBe('Livraria "O Saber"');
    });
  });

  describe('OFX 1.0 (SGML) & OFX 2.0 (XML) Statement Parser', () => {
    it('parses OFX 1.0 with flat SGML headers and unclosed leaf tags', () => {
      const tzTag = '[' + '-3' + ':BRT]';
      const ofx1 = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\n\n<OFX>\n<BANKMSGSRSV1>\n<STMTTRNRS>\n<STMTRS>\n<CURDEF>BRL\n<BANKTRANLIST>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261010120000${tzTag}\n<TRNAMT>-45.50\n<FITID>OFX1-001\n<NAME>Uber\n<MEMO>Uber *Trip Sao Paulo\n<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20261012000000\n<TRNAMT>1500.00\n<FITID>OFX1-002\n<NAME>Salario\n</BANKTRANLIST>\n</STMTRS>\n</STMTTRNRS>\n</BANKMSGSRSV1>\n</OFX>`;

      const result = parseOfx(ofx1, accountId);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);

      const tx1 = result.transactions[0];
      expect(tx1.date).toBe('2026-10-10');
      expect(tx1.amountCents).toBe(4550);
      expect(tx1.type).toBe('expense');
      expect(tx1.fitid).toBe('OFX1-001');
      expect(tx1.payee).toBe('Uber');
      expect(tx1.notes).toBe('Uber *Trip Sao Paulo');

      const tx2 = result.transactions[1];
      expect(tx2.date).toBe('2026-10-12');
      expect(tx2.amountCents).toBe(150000);
      expect(tx2.type).toBe('income');
      expect(tx2.fitid).toBe('OFX1-002');
    });

    it('parses OFX 2.0 with XML structure and closed tags', () => {
      const ofx2 = `<?xml version="1.0" encoding="utf-8" ?>\n<OFX>\n  <CREDITCARDMSGSRSV1>\n    <CCSTMTTRNRS>\n      <CCSTMTRS>\n        <CURDEF>BRL</CURDEF>\n        <BANKTRANLIST>\n          <STMTTRN>\n            <TRNTYPE>DEBIT</TRNTYPE>\n            <DTPOSTED>20261014120000</DTPOSTED>\n            <TRNAMT>-89.90</TRNAMT>\n            <FITID>OFX2-999</FITID>\n            <NAME>iFood</NAME>\n            <MEMO>Restaurante Bom Sabor</MEMO>\n          </STMTTRN>\n        </BANKTRANLIST>\n      </CCSTMTRS>\n    </CCSTMTTRNRS>\n  </CREDITCARDMSGSRSV1>\n</OFX>`;

      const result = parseOfx(ofx2, accountId);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].date).toBe('2026-10-14');
      expect(result.transactions[0].amountCents).toBe(8990);
      expect(result.transactions[0].type).toBe('expense');
      expect(result.transactions[0].payee).toBe('iFood');
    });
  });

  describe('Regressions: amounts, dates, CSV quotes, OFX entities', () => {
    it('reads trailing/leading D/C tokens before stripping currency letters', () => {
      expect(parseAmountToCents('1.234,56 D')).toEqual({ cents: 123456, type: 'expense' });
      expect(parseAmountToCents('1.234,56 C')).toEqual({ cents: 123456, type: 'income' });
      expect(parseAmountToCents('R$ 50,00 DEB')).toEqual({ cents: 5000, type: 'expense' });
      expect(parseAmountToCents('50,00 débito')).toEqual({ cents: 5000, type: 'expense' });
      expect(parseAmountToCents('50,00 CREDITO')).toEqual({ cents: 5000, type: 'income' });
      expect(parseAmountToCents('D 10,00')).toEqual({ cents: 1000, type: 'expense' });
      expect(parseAmountToCents('cred 10,00')).toEqual({ cents: 1000, type: 'income' });
      expect(parseAmountToCents('10,00D')).toEqual({ cents: 1000, type: 'expense' });
      // Currency codes ending in D are not D/C tokens
      expect(parseAmountToCents('10.00 USD')).toEqual({ cents: 1000, type: 'income' });
    });

    it('treats a repeated separator as thousands grouping', () => {
      expect(parseAmountToCents('1,234,567')).toEqual({ cents: 123456700, type: 'income' });
      expect(parseAmountToCents('1.234.567')).toEqual({ cents: 123456700, type: 'income' });
      expect(parseAmountToCents('-1,234,567.89')).toEqual({ cents: 123456789, type: 'expense' });
    });

    it('resolves a lone 3-digit group by the file decimal style (default thousands)', () => {
      expect(parseAmountToCents('1.234')).toEqual({ cents: 123400, type: 'income' });
      expect(parseAmountToCents('1,234')).toEqual({ cents: 123400, type: 'income' });
      expect(parseAmountToCents('1.234', undefined, { decimalHint: '.' })).toEqual({ cents: 123, type: 'income' });
      expect(parseAmountToCents('1.234', undefined, { decimalHint: ',' })).toEqual({ cents: 123400, type: 'income' });
      expect(detectDecimalStyle(['10,50', '1.234', '3,00 D'])).toBe(',');
      expect(detectDecimalStyle(['10.50', '1,234'])).toBe('.');
      expect(detectDecimalStyle(['1.234', '5'])).toBeNull();
    });

    it('records the ambiguous-amount decision in CSV metadata and warnings', () => {
      const csv = `data;descricao;valor
15/10/2026;Loja A;-10,50
16/10/2026;Loja B;1.234`;
      const result = parseCsv(csv, accountId);
      expect(result.transactions[1].amountCents).toBe(123400);
      expect(result.metadata.detectedDecimalSeparator).toBe(',');
      expect(result.metadata.ambiguousAmountsResolvedAs).toBe('thousands');
      expect(result.metadata.ambiguousAmountsCount).toBe(1);
      expect(result.warnings.some((w) => w.code === 'AMBIGUOUS_AMOUNT')).toBe(true);

      const usCsv = `date,payee,amount
2026-10-15,Shop A,-10.50
2026-10-16,Shop B,1.234`;
      const usResult = parseCsv(usCsv, accountId);
      expect(usResult.transactions[1].amountCents).toBe(123);
      expect(usResult.metadata.ambiguousAmountsResolvedAs).toBe('decimal');
    });

    it('rejects impossible calendar dates and counts the row as invalid', () => {
      expect(parseDate('31/02/2026', 'DD/MM/YYYY')).toBeNull();
      expect(parseDate('31/04/2026', 'DD/MM/YYYY')).toBeNull();
      expect(parseDate('10/13/2026', 'DD/MM/YYYY')).toBeNull();
      expect(parseDate('2026-02-30')).toBeNull();
      expect(parseDate('29/02/2028', 'DD/MM/YYYY')).toBe('2028-02-29');
      expect(parseOfxDate('20260231')).toBeNull();
      expect(parseOfxDate('20261301')).toBeNull();

      const csv = `data,valor,descricao
15/10/2026,-10.00,Ok
31/02/2026,-20.00,Impossivel`;
      const result = parseCsv(csv, accountId);
      expect(result.transactions).toHaveLength(1);
      expect(result.metadata.invalidRowsCount).toBe(1);
      expect(result.warnings.some((w) => w.code === 'INVALID_DATE')).toBe(true);
    });

    it('scans ALL rows for date format detection, warning when still ambiguous', () => {
      const early = Array.from({ length: 25 }, (_, i) => `${String((i % 12) + 1).padStart(2, '0')}/05/2026,-1.00,Item ${i}`);
      const csv = ['data,valor,descricao', ...early, '05/25/2026,-1.00,Late proof'].join('\n');
      const result = parseCsv(csv, accountId);
      expect(result.metadata.detectedDateFormat).toBe('MM/DD/YYYY');
      expect(result.metadata.dateFormatAmbiguous).toBe(false);

      expect(detectDateFormatDetailed(['01/02/2026', '03/04/2026'])).toEqual({ format: 'DD/MM/YYYY', ambiguous: true });
      const ambiguous = parseCsv(`data,valor,descricao
01/02/2026,-1.00,A
03/04/2026,-2.00,B`, accountId);
      expect(ambiguous.metadata.detectedDateFormat).toBe('DD/MM/YYYY');
      expect(ambiguous.warnings.some((w) => w.code === 'AMBIGUOUS_DATE_FORMAT')).toBe(true);
    });

    it('treats a quote in the middle of an unquoted field as a literal character', () => {
      const rows = parseCsvRows('data,valor,descricao\n10/10/2026,-5.00,Loja 5" Polegadas,extra', ',');
      expect(rows[1]).toEqual(['10/10/2026', '-5.00', 'Loja 5" Polegadas', 'extra']);
      const result = parseCsv('data,valor,descricao\n10/10/2026,-5.00,TV 42" Samsung\n11/10/2026,-6.00,Outra', accountId);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].payee).toBe('TV 42" Samsung');
      expect(result.transactions[1].payee).toBe('Outra');
    });

    it('decodes OFX entities in a single pass', () => {
      expect(decodeOfxEntities('A &amp;lt; B')).toBe('A &lt; B');
      expect(decodeOfxEntities('P&amp;G &lt;3&gt;')).toBe('P&G <3>');
      const ofx = `<OFX><STMTTRN><DTPOSTED>20261015</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>X1</FITID><NAME>Loja &amp;amp; Cia</NAME></STMTTRN></OFX>`;
      expect(parseOfx(ofx, accountId).transactions[0].payee).toBe('Loja &amp; Cia');
    });

    it('tags drafts with their source format', () => {
      expect(parseCsv(`data,valor,descricao
15/10/2026,-10.00,X`, accountId).transactions[0].source).toBe('csv');
      const ofx = `<OFX><STMTTRN><DTPOSTED>20261015</DTPOSTED><TRNAMT>-10,5</TRNAMT><NAME>T</NAME></STMTTRN></OFX>`;
      const tx = parseOfx(ofx, accountId).transactions[0];
      expect(tx.source).toBe('ofx');
      expect(tx.amountCents).toBe(1050);
    });
  });

  describe('Unified Entry Point & Error Stream', () => {
    it('auto-detects OFX format and routes appropriately', async () => {
      const ofx = `<OFX><STMTTRN><DTPOSTED>20261015</DTPOSTED><TRNAMT>-10.00</TRNAMT><NAME>Test</NAME></STMTTRN></OFX>`;
      const res = await parseImportFile(ofx, 'auto', accountId);

      expect(res.metadata.fileType).toBe('ofx');
      expect(res.transactions).toHaveLength(1);
    });

    it('reports warnings for malformed rows without catastrophic failure', () => {
      const csv = `data,valor,descricao\n10/10/2026,-50.00,Valido\nINVALID_DATE,-30.00,Data Ruim\n12/10/2026,INVALID_VAL,Valor Ruim\n13/10/2026,-70.00,Valido 2`;
      const result = parseCsv(csv, accountId);

      expect(result.transactions).toHaveLength(2);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
      expect(result.warnings.some((w) => w.code === 'INVALID_DATE')).toBe(true);
      expect(result.warnings.some((w) => w.code === 'INVALID_AMOUNT')).toBe(true);
    });

    it('handles empty files gracefully', async () => {
      const res = await parseImportFile('', 'auto', accountId);
      expect(res.success).toBe(false);
      expect(res.transactions).toHaveLength(0);
      expect(res.warnings[0].code).toBe('INCOMPLETE_ROW');
    });
  });
});
