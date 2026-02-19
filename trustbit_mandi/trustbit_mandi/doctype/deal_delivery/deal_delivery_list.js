frappe.listview_settings['Deal Delivery'] = {
	has_indicator_for_draft: true,
	has_indicator_for_cancelled: true,
	get_indicator: function(doc) {
		if (doc.docstatus === 0) {
			return [__('Sent for Loading & Check'), 'orange', 'docstatus,=,0'];
		} else if (doc.docstatus === 1) {
			return [__('Loaded & Submitted'), 'blue', 'docstatus,=,1'];
		} else if (doc.docstatus === 2) {
			return [__('Cancelled'), 'red', 'docstatus,=,2'];
		}
	}
};
