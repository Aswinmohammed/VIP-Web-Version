import { Order, OrderItem } from '../types';

export const calculateItemTotal = (item: OrderItem): number => {
    const materialCost = (item.clothSize || 0) * (item.pricePerUnit || 0) * (item.quantity || 1);
    const stitchCost = (item.stitchFee || 0) * (item.quantity || 1);
    return materialCost + stitchCost;
};

export const calculateOrderTotals = (order: Order) => {
    // 1. Calculate unrounded items total
    const rawItemsTotal = (order.items || []).reduce((sum, item) => sum + calculateItemTotal(item), 0);
    
    // 2. Subtract discount
    const discount = Number(order.discount) || 0;
    const rawFinalAmount = Math.max(0, rawItemsTotal - discount);
    
    // 3. Apply nearest-50 rounding to the final amount (as requested by user)
    const finalAmount = Math.round(rawFinalAmount / 50) * 50;
    
    // We'll also return the itemsTotal rounded to nearest integer for display
    const itemsTotal = Math.round(rawItemsTotal);
    const roundedDiscount = Math.round(discount);
    
    // 4. Calculate total paid
    const paid = Math.round((order.payments || []).reduce((sum, p) => sum + p.amount, 0) || (order.advance || 0));
    
    // 5. Calculate balance
    const balance = Math.max(0, finalAmount - paid);

    return {
        itemsTotal,
        discount: roundedDiscount,
        finalAmount,
        paid,
        balance
    };
};
