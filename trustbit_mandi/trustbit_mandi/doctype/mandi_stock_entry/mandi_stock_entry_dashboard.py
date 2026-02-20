def get_data():
	return {
		"fieldname": "mandi_stock_entry",
		"internal_links": {
			"Deal Delivery": "deal_delivery",
			"Stock Entry": "erp_stock_entry"
		},
		"transactions": [
			{
				"label": "Source",
				"items": ["Deal Delivery"]
			},
			{
				"label": "ERPNext",
				"items": ["Stock Entry"]
			}
		]
	}
