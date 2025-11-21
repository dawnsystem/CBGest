import { NifType } from '../types';

export const detectNifType = (nif: string): NifType => {
  if (!nif) return 'NIF';
  const str = nif.toUpperCase().replace(/\s/g, '');

  const dniRegex = /^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
  const nieRegex = /^[XYZ][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
  const cifRegex = /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/;

  if (dniRegex.test(str)) return 'DNI';
  if (nieRegex.test(str)) return 'NIE';
  if (cifRegex.test(str)) return 'CIF';

  return 'NIF';
};

export const isValidNIF = (nif: string): boolean => {
  if (!nif) return false;
  const str = nif.toUpperCase().replace(/\s/g, '');
  
  // Expresiones regulares básicas
  const dniRegex = /^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
  const nieRegex = /^[XYZ][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
  const cifRegex = /^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$/;

  // Validación DNI
  if (dniRegex.test(str)) {
    const number = parseInt(str.substr(0, 8), 10);
    const letter = str.substr(8, 1);
    const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
    return letters.charAt(number % 23) === letter;
  }

  // Validación NIE
  if (nieRegex.test(str)) {
    let niePrefix = str.charAt(0);
    let prefixMap: {[key: string]: string} = { 'X': '0', 'Y': '1', 'Z': '2' };
    let numberStr = prefixMap[niePrefix] + str.substr(1, 7);
    const number = parseInt(numberStr, 10);
    const letter = str.substr(8, 1);
    const letters = "TRWAGMYFPDXBNJZSQVHLCKE";
    return letters.charAt(number % 23) === letter;
  }

  // Validación CIF (Simplificada pero robusta para la mayoría de casos)
  if (cifRegex.test(str)) {
    const letter = str.charAt(0);
    const digits = str.substr(1, 7);
    const control = str.charAt(8);
    
    let evenSum = 0;
    let oddSum = 0;
    
    for (let i = 0; i < digits.length; i++) {
      const n = parseInt(digits[i], 10);
      if (i % 2 === 0) { // Posiciones impares (índice 0, 2, 4...)
        const doubled = n * 2;
        oddSum += doubled < 10 ? doubled : doubled - 9;
      } else {
        evenSum += n;
      }
    }
    
    const total = evenSum + oddSum;
    const unit = total % 10;
    const controlDigit = unit === 0 ? 0 : 10 - unit;
    const controlLetter = "JABCDEFGHI".charAt(controlDigit);
    
    return control == controlDigit.toString() || control === controlLetter;
  }

  return false;
};