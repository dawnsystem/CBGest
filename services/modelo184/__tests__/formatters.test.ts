import { describe, it, expect } from 'vitest';
import {
  formatAeatAmount,
  formatAeatDomicilio,
  formatAeatParticipation,
  formatAeatPercent,
  formatAeatText,
} from '../pdf/formatters';

describe('modelo184 formatters', () => {
  it('formatAeatAmount usa separadores españoles', () => {
    expect(formatAeatAmount(61020.39)).toBe('61.020,39');
  });

  it('formatAeatParticipation usa 4 decimales', () => {
    expect(formatAeatParticipation(50)).toBe('50,0000');
  });

  it('formatAeatPercent usa 2 decimales', () => {
    expect(formatAeatPercent(50)).toBe('50,00');
  });

  it('formatAeatText elimina acentos y pasa a mayúsculas', () => {
    expect(formatAeatText('Sant Esteve de Palautordera')).toBe('SANT ESTEVE DE PALAUTORDERA');
  });

  it('formatAeatDomicilio trunca domicilios largos', () => {
    const long = 'A'.repeat(50);
    expect(formatAeatDomicilio(long, 40).length).toBe(40);
  });
});
