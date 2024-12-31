# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.exceptions import AccessError
from odoo.http import request

class OrgChartController(http.Controller):
    _managers_level = 5  # FP request

    def _check_record(self, model, record_id, **kw):
        if not record_id:
            return None
        record_id = int(record_id)

        context = kw.get('context', request.env.context)
        if 'allowed_company_ids' in context:
            cids = context['allowed_company_ids']
        else:
            cids = [request.env.company.id]

        Record = request.env[model].with_context(allowed_company_ids=cids)
        record = Record.browse(record_id)
        return record if record.has_access('read') else None

    def _prepare_record_data(self, record, child_field):
        job = record.sudo().job_id if 'job_id' in record else None
        return dict(
            id=record.id,
            name=record.name,
            link=f'/mail/view?model={record._name}&res_id={record.id}',
            job_id=job.id if job else None,
            job_name=job.name if job else '',
            job_title=record.job_title if 'job_title' in record else '',
            direct_sub_count=len(getattr(record, child_field) - record),
            indirect_sub_count=len(getattr(record, child_field).child_all_ids) if 'child_all_ids' in record else 0,
        )

    @http.route('/org_chart/get_org_chart', type='json', auth='user')
    def get_org_chart(self, model, record_id, child_field='child_ids', **kw):

        record = self._check_record(model, record_id, **kw)
        if not record:
            return {
                'managers': [],
                'children': [],
            }

        ancestors, current = request.env[model].sudo(), record.sudo()
        while current.parent_id and len(ancestors) < self._managers_level + 1 and current != current.parent_id:
            ancestors += current.parent_id
            current = current.parent_id

        values = dict(
            self=self._prepare_record_data(record, child_field),
            managers=[
                self._prepare_record_data(ancestor, child_field)
                for idx, ancestor in enumerate(ancestors)
                if idx < self._managers_level
            ],
            managers_more=len(ancestors) > self._managers_level,
            children=[self._prepare_record_data(child, child_field) for child in getattr(record, child_field) if child != record],
        )
        values['managers'].reverse()
        return values