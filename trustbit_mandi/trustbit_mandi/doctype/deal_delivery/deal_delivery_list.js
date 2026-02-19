frappe.listview_settings['Deal Delivery'] = {
	get_indicator: function(doc) {
		if (doc.status === 'Loaded & Submitted') {
			return [__('Loaded & Submitted'), 'blue', 'status,=,Loaded & Submitted'];
		} else if (doc.status === 'Cancelled') {
			return [__('Cancelled'), 'red', 'status,=,Cancelled'];
		} else if (doc.status === 'Sent for Loading & Check') {
			return [__('Sent for Loading & Check'), 'orange', 'status,=,Sent for Loading & Check'];
		}
	}
};
