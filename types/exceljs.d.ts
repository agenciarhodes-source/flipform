declare module 'exceljs' {
  namespace ExcelJS {
    type CellValue = string | number | boolean | Date | null | undefined;
    interface Cell {
      value: CellValue;
      font?: any;
      fill?: any;
      border?: any;
      alignment?: any;
      numFmt?: string;
    }
    interface Row {
      getCell(col: number | string): Cell;
      eachCell(callback: (cell: Cell, colNumber: number) => void): void;
    }
    interface Column { width?: number; }
    interface Worksheet {
      columnCount: number;
      views: any[];
      autoFilter: any;
      addRow(values: CellValue[] | Record<string, CellValue>): Row;
      addRows(values: (CellValue[] | Record<string, CellValue>)[]): void;
      getRow(row: number): Row;
      getCell(address: string): Cell;
      getColumn(col: number | string): Column;
      mergeCells(range: string): void;
      eachRow(callback: (row: Row, rowNumber: number) => void): void;
    }
  }
  class Workbook {
    creator: string;
    created: Date;
    modified: Date;
    xlsx: { writeBuffer(): Promise<ArrayBuffer> };
    addWorksheet(name: string): ExcelJS.Worksheet;
  }
  export = ExcelJS;
  namespace ExcelJS { export { Workbook }; }
}
