def get_data():
	return {
		'internal_links': {
			'Deal Delivery': ['load_items', 'deal_delivery'],
			'Sales Invoice': ['customer_payments', 'sales_invoice'],
			'Payment Entry': ['customer_payments', 'payment_entry']
		},
		'transactions': [
			{
				'label': 'Deliveries',
				'items': ['Deal Delivery']
			},
			{
				'label': 'Billing',
				'items': ['Sales Invoice', 'Payment Entry']
			}
		]
	}
