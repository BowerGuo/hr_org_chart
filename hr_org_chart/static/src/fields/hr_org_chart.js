/** @odoo-module **/

import { registry } from "@web/core/registry";
import { FormController } from "@web/views/form/form_controller";
import { formView } from "@web/views/form/form_view";
import { Component, onWillStart, onWillRender, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { usePopover } from "@web/core/popover/popover_hook";
import { rpc } from "@web/core/network/rpc";
import { user } from "@web/core/user";

// 组织结构图组件
class HrOrgChartPopover extends Component {
    static template = "hr_org_chart.hr_orgchart_emp_popover";
    static props = {
        employee: Object,
        close: Function,
    };
    async setup() {
        super.setup();
        this.orm = useService('orm');
        this.actionService = useService("action");
    }

    async _onEmployeeRedirect(employeeId) {
        const action = await this.orm.call('hr.employee', 'get_formview_action', [employeeId]);
        this.actionService.doAction(action);
    }
}

class HrOrgChart extends Component {
    static template = "hr_org_chart.hr_org_chart";
    async setup() {
        super.setup();
        this.orm = useService('orm');
        this.actionService = useService("action");
        this.popover = usePopover(HrOrgChartPopover);
        this.state = useState({ 'employee_id': null });
        onWillStart(this.handleComponentUpdate.bind(this));
        onWillRender(this.handleComponentUpdate.bind(this));
    }

    async handleComponentUpdate() {
        this.employee = this.props.record.data;
        const formOptions = this.props.record.fieldsInfo[this.props.record.model]['form'].options || {};
        this.childTreeField = formOptions.child_tree;
        if (this.childTreeField) {
            this.state.employee_id = this.employee[this.childTreeField] ? this.employee[this.childTreeField].resIds[0] : this.props.record.resId;
            const manager = this.employee.parent_id || this.employee.employee_parent_id;
            const forceReload = this.lastRecord !== this.props.record || this.lastParent !== manager;
            this.lastParent = manager;
            this.lastRecord = this.props.record;
            await this.fetchEmployeeData(this.state.employee_id, forceReload);
        }
    }

    async fetchEmployeeData(employeeId, force = false) {
        if (!employeeId) {
            this.managers = [];
            this.children = [];
            if (this.view_employee_id) {
                this.render(true);
            }
            this.view_employee_id = null;
        } else if (employeeId !== this.view_employee_id || force) {
            this.view_employee_id = employeeId;
            let orgData = await rpc(
                '/hr/get_org_chart',
                { employee_id: employeeId, context: user.context }
            );
            if (Object.keys(orgData).length === 0) {
                orgData = { managers: [], children: [] };
            }
            this.managers = orgData.managers;
            this.children = orgData.children;
            this.managers_more = orgData.managers_more;
            this.self = orgData.self;
            this.render(true);
        }
    }

    _onOpenPopover(event, employee) {
        this.popover.open(event.currentTarget, { employee });
    }

    async _onEmployeeRedirect(employeeId) {
        const action = await this.orm.call('hr.employee', 'get_formview_action', [employeeId]);
        this.actionService.doAction(action);
    }

    async _onEmployeeMoreManager(managerId) {
        await this.fetchEmployeeData(managerId);
        this.state.employee_id = managerId;
    }
}

// 扩展现有的 FormController
class ExtendedFormController extends FormController {
    setup() {
        super.setup();
        onWillStart(this.createOrgChart.bind(this));
    }

    async createOrgChart() {
        const formOptions = this.model.root.fieldsInfo[this.model.root.model]['form'].options || {};
        if (formOptions.child_tree) {
            const orgChart = new HrOrgChart(null, {
                props: {
                    record: this.model.root,
                    child_tree_field: formOptions.child_tree
                }
            });
            orgChart.mount(this.el.querySelector('.o_form_sheet'));
        }
    }
}

// 获取现有的 form 视图配置
const formViewConfig = registry.category("views").get("form");

// 替换控制器为扩展后的控制器
formViewConfig.Controller = ExtendedFormController;

// 更新现有的 form 视图配置
registry.category("views").add("form", formViewConfig);