import { Order, OrderItem } from '../types';

export const calculateItemTotal = (item: OrderItem): number => {
    const materialCost = (item.clothSize || 0) * (item.pricePerUnit || 0) * (item.quantity || 1);
    const stitchCost = (item.stitchFee || 0) * (item.quantity || 1);
    return materialCost + stitchCost;
};

export const calculateOrderTotals = (order: Order) => {
    // 1. Calculate unrounded items total
    const itemsTotal = (order.items || []).reduce((sum, item) => sum + calculateItemTotal(item), 0);
    
    // 2. Subtract discount
    const discount = Number(order.discount) || 0;
    const finalAmount = Math.max(0, itemsTotal - discount);
    
    // 3. Calculate total paid
    const paid = (order.payments || []).reduce((sum, p) => sum + p.amount, 0) || (order.advance || 0);
    
    // 4. Calculate balance
    const balance = Math.max(0, finalAmount - paid);

    return {
        itemsTotal,
        discount,
        finalAmount,
        paid,
        balance
    };
};
