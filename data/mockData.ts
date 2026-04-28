
import { Customer, Order, InventoryItem, Expense, Settings } from '../types';

const today = new Date();
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const generateMockData = () => {
  return {
    customers: [],
    orders: [],
    inventory: [],
    expenses: [],
    settings: {
      appExpiryDate: '',
      shopName: 'VIP Tailors'
    }
  };
};
