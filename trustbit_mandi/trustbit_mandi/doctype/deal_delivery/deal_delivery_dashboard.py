def get_data():
	return {
		'fieldname': 'deal_delivery',
		'internal_links': {
			'Deal': ['items', 'soda']
		},
		'transactions': [
			{
				'label': 'Deals',
				'items': ['Deal']
			},
			{
				'label': 'Dispatch',
				'items': ['Vehicle Dispatch']
			}
		]
	}
