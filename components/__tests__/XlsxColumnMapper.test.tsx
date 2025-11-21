import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { XlsxColumnMapper } from '../XlsxColumnMapper';
import ExcelJS from 'exceljs';

// Helper to create a base64 encoded Excel file
async function createMockExcelBase64(data: any[][]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  data.forEach((row) => {
    worksheet.addRow(row);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = btoa(
    new Uint8Array(buffer as ArrayBuffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ''
    )
  );
  return base64;
}

describe('XlsxColumnMapper', () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Excel parsing', () => {
    it('should parse Excel file and display preview', async () => {
      const testData = [
        ['Fecha', 'Concepto', 'Importe'],
        ['2024-01-15', 'Pago alquiler', -500],
        ['2024-01-16', 'Ingreso nómina', 2000],
      ];

      const base64Data = await createMockExcelBase64(testData);

      render(
        <XlsxColumnMapper
          base64Data={base64Data}
          fileName="test.xlsx"
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      // Wait for async parsing
      await waitFor(() => {
        expect(screen.getByText('test.xlsx')).toBeInTheDocument();
      });

      // Should auto-detect columns based on headers
      await waitFor(() => {
        expect(screen.getByText('Mapear Columnas del Excel')).toBeInTheDocument();
      });
    });

    it('should auto-detect date column from Spanish headers', async () => {
      const testData = [
        ['F.Valor', 'Descripción', 'Cargo', 'Abono'],
        ['15/01/2024', 'Recibo luz', 150, ''],
        ['16/01/2024', 'Transferencia', '', 800],
      ];

      const base64Data = await createMockExcelBase64(testData);

      render(
        <XlsxColumnMapper
          base64Data={base64Data}
          fileName="bbva.xlsx"
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('bbva.xlsx')).toBeInTheDocument();
      });
    });

    it('should handle separate debit/credit columns', async () => {
      const testData = [
        ['Fecha', 'Movimiento', 'Cargo', 'Abono'],
        ['2024-01-15', 'Compra supermercado', 50.25, null],
        ['2024-01-16', 'Nómina', null, 1500],
      ];

      const base64Data = await createMockExcelBase64(testData);

      render(
        <XlsxColumnMapper
          base64Data={base64Data}
          fileName="extracto.xlsx"
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        // Should detect separate debit/credit mode
        expect(screen.getByText(/Dos columnas/i)).toBeInTheDocument();
      });
    });

    it('should call onCancel when cancel button is clicked', async () => {
      const testData = [
        ['Fecha', 'Concepto', 'Importe'],
        ['2024-01-15', 'Test', 100],
      ];

      const base64Data = await createMockExcelBase64(testData);

      render(
        <XlsxColumnMapper
          base64Data={base64Data}
          fileName="test.xlsx"
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Cancelar')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancelar'));
      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('date parsing', () => {
    it('should parse DD/MM/YYYY format', async () => {
      const testData = [
        ['Fecha', 'Concepto', 'Importe'],
        ['15/01/2024', 'Test 1', 100],
        ['01/12/2023', 'Test 2', 200],
      ];

      const base64Data = await createMockExcelBase64(testData);

      render(
        <XlsxColumnMapper
          base64Data={base64Data}
          fileName="test.xlsx"
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        // Verify dates are shown in preview
        expect(screen.getByText('15/01/2024')).toBeInTheDocument();
      });
    });

    it('should parse YYYY-MM-DD format', async () => {
      const testData = [
        ['Fecha', 'Concepto', 'Importe'],
        ['2024-01-15', 'Test ISO', 100],
      ];

      const base64Data = await createMockExcelBase64(testData);

      render(
        <XlsxColumnMapper
          base64Data={base64Data}
          fileName="test.xlsx"
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('2024-01-15')).toBeInTheDocument();
      });
    });

    it('should handle Date objects from Excel', async () => {
      const testData = [
        ['Fecha', 'Concepto', 'Importe'],
        [new Date(2024, 0, 15), 'Test Date Object', 100],
      ];

      const base64Data = await createMockExcelBase64(testData);

      render(
        <XlsxColumnMapper
          base64Data={base64Data}
          fileName="test.xlsx"
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('test.xlsx')).toBeInTheDocument();
      });
    });
  });

  describe('error handling', () => {
    it('should show error for empty file', async () => {
      const testData = [
        ['Header only'],
      ];

      const base64Data = await createMockExcelBase64(testData);

      render(
        <XlsxColumnMapper
          base64Data={base64Data}
          fileName="empty.xlsx"
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/no contiene suficientes datos/i)).toBeInTheDocument();
      });
    });

    it('should show error for invalid base64', async () => {
      render(
        <XlsxColumnMapper
          base64Data="invalid-base64-data"
          fileName="bad.xlsx"
          onConfirm={mockOnConfirm}
          onCancel={mockOnCancel}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Error al leer el archivo Excel/i)).toBeInTheDocument();
      });
    });
  });
});

describe('Excel flow integration', () => {
  it('should process transactions correctly when confirmed', async () => {
    const mockOnConfirm = vi.fn();
    const mockOnCancel = vi.fn();

    const testData = [
      ['Fecha', 'Concepto', 'Importe'],
      ['2024-01-15', 'Pago factura', -250.50],
      ['2024-01-20', 'Cobro cliente', 1000],
    ];

    const base64Data = await createMockExcelBase64(testData);

    render(
      <XlsxColumnMapper
        base64Data={base64Data}
        fileName="transactions.xlsx"
        onConfirm={mockOnConfirm}
        onCancel={mockOnCancel}
      />
    );

    // Wait for component to parse and render
    await waitFor(() => {
      expect(screen.getByText('Mapeo configurado correctamente')).toBeInTheDocument();
    }, { timeout: 3000 });

    // Click process button
    const processButton = screen.getByText('Procesar');
    fireEvent.click(processButton);

    // Verify onConfirm was called with parsed transactions
    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalled();
    });

    const transactions = mockOnConfirm.mock.calls[0][0];
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({
      date: '2024-01-15',
      concept: 'Pago factura',
      amount: -250.5,
    });
    expect(transactions[1]).toMatchObject({
      date: '2024-01-20',
      concept: 'Cobro cliente',
      amount: 1000,
    });
  });
});
