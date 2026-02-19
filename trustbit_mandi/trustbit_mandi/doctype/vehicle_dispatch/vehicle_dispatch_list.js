frappe.listview_settings['Vehicle Dispatch'] = {
	has_indicator_for_draft: true,
	has_indicator_for_cancelled: true,
	get_indicator: function(doc) {
		if (doc.docstatus === 0) {
			return [__('Loading'), 'orange', 'docstatus,=,0'];
		} else if (doc.docstatus === 1) {
			return [__('Dispatched'), 'blue', 'docstatus,=,1'];
		} else if (doc.docstatus === 2) {
			return [__('Cancelled'), 'red', 'docstatus,=,2'];
		}
	}
};
