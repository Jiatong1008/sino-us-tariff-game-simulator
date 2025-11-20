(function(){
    // 确保 ECharts 与 Vue 已加载
    if(typeof Vue === 'undefined') { console.error('Vue 未加载'); }
    if(typeof echarts === 'undefined') { console.error('ECharts 未加载'); }

    new Vue({
        el: '#app',
        data: {
            currentPage: 'overview',
            pages: [
                { id: 'overview', name: '系统概览', icon: 'fas fa-tachometer-alt' },
                { id: 'static', name: '静态博弈分析', icon: 'fas fa-fist-raised' },
                { id: 'dynamic', name: '动态博弈仿真', icon: 'fas fa-sync-alt' },
                { id: 'mixed', name: '混合策略计算', icon: 'fas fa-dice' },
                { id: 'scenario', name: '情景模拟器', icon: 'fas fa-sliders-h' },
                { id: 'ai', name: 'AI策略推荐', icon: 'fas fa-robot' }
            ],
            cooperationReward: 7,
            temptation: 8,
            punishment: 3,
            sucker: 2,
            gdpWeight: 5,
            tradeWeight: 3,
            stockWeight: 2,
            selectedStage: 'conflict',
            stages: [
                { id: 'conflict', name: '阶段1: 升级期(2-4月)' },
                { id: 'cooling', name: '阶段2: 降温期(5-10月)' },
                { id: 'buffer', name: '阶段3: 缓冲期(11月至今)' }
            ],
            pUS: 70,
            pCN: 70,
            sensitivityRange: [0, 100],
            selectedScenario: 'conflict',
            scenarios: [
                { id: 'conflict', name: '2025年2月升级期', description: '高强度对抗', icon: 'fas fa-exclamation-triangle' },
                { id: 'cooling', name: '2025年5月降温期', description: '有限合作', icon: 'fas fa-handshake' },
                { id: 'buffer', name: '2025年11月缓冲期', description: '长期合作', icon: 'fas fa-dove' }
            ],
            customParams: {
                usTariff: 10,
                cnTariff: 10,
                duration: 1,
                cooperation: 50
            },
            customTrade: 0,
            customTech: 'normal',
            currentTariff: 45,
            politicalPressure: 60,
            economicGrowth: 70,
            techDependency: 40,
            negotiationLeverage: 50,
            internationalSupport: 65,
            aiRecommendation: null,
            _charts: {} // 存放 ECharts 实例
        },
        computed: {
            totalWeight() { return this.gdpWeight + this.tradeWeight + this.stockWeight; },
            nashEquilibria() {
                const res = []; const S = ['合作','对抗'];
                for (let u of S) for (let v of S) if (this.isNashEquilibrium(u,v)) res.push([u,v]);
                return res;
            },
            mixedEquilibrium() {
                const T=this.temptation,R=this.cooperationReward,P=this.punishment,S=this.sucker;
                const denom = (R - S - T + P);
                if (Math.abs(denom) < 1e-6) return {p:0.5,q:0.5};
                let val = (P - S) / denom; return {p: Math.max(0,Math.min(1,val)), q: Math.max(0,Math.min(1,val))};
            },
            expectedPayoffUS() {
                const p=this.pUS/100,q=this.pCN/100;
                const cc=this.calculatePayoff('合作','合作')[0];
                const cd=this.calculatePayoff('合作','对抗')[0];
                const dc=this.calculatePayoff('对抗','合作')[0];
                const dd=this.calculatePayoff('对抗','对抗')[0];
                return p*q*cc + p*(1-q)*cd + (1-p)*q*dc + (1-p)*(1-q)*dd;
            },
            expectedPayoffCN() {
                const p=this.pUS/100,q=this.pCN/100;
                const cc=this.calculatePayoff('合作','合作')[1];
                const cd=this.calculatePayoff('合作','对抗')[1];
                const dc=this.calculatePayoff('对抗','合作')[1];
                const dd=this.calculatePayoff('对抗','对抗')[1];
                return p*q*cc + p*(1-q)*cd + (1-p)*q*dc + (1-p)*(1-q)*dd;
            },
            totalWelfare(){ return this.expectedPayoffUS + this.expectedPayoffCN; },
            customScore(){
                const coop=(this.customParams.cooperation||50)/100;
                const tariffPenalty=((+this.customParams.usTariff||0)+(+this.customParams.cnTariff||0))/300;
                const tradeBenefit=Math.max(0,Math.min(1,Math.abs(this.customTrade)/100));
                let techBonus=0.5;
                if(this.customTech==='blockade') techBonus=0;
                if(this.customTech==='limited') techBonus=0.2;
                if(this.customTech==='deep') techBonus=0.8;
                const score=coop*0.6 + (1-tariffPenalty)*0.2 + tradeBenefit*0.1 + techBonus*0.1;
                return Math.round(Math.max(0,Math.min(1,score))*100);
            },
            currentScenarioData(){
                const base = {
                    conflict: { title:'升级期 - 高强度对抗', icon:'fas fa-exclamation-triangle', panelClass:'warning',
                        metrics:[{label:'关税(美)',value:'145%'},{label:'关税(中)',value:'125%'},{label:'GDP冲击',value:'美国-783亿 / 中国-700亿'}],
                        tableTitle:'升级期指标影响', tableData:[{indicator:'GDP',usImpact:'-783亿',cnImpact:'-700亿',trend:'down'},{indicator:'股市',usImpact:'-8.23%',cnImpact:'-2.94%',trend:'down'},{indicator:'贸易',usImpact:'-70%',cnImpact:'-65%',trend:'down'}]
                    },
                    cooling: { title:'降温期 - 有限合作', icon:'fas fa-handshake', panelClass:'info',
                        metrics:[{label:'关税(美→)',value:'54%→10%'},{label:'关税(中→)',value:'34%→10%'},{label:'股市表现',value:'纳指+9.32% / 上证+2.09%'}],
                        tableTitle:'降温期指标影响', tableData:[{indicator:'GDP',usImpact:'-20亿',cnImpact:'-10亿',trend:'stable'},{indicator:'股市',usImpact:'+9.32%',cnImpact:'+2.09%',trend:'up'}]
                    },
                    buffer: { title:'缓冲期 - 长期稳定', icon:'fas fa-dove', panelClass:'success',
                        metrics:[{label:'关税',value:'双方维持10%'},{label:'GDP',value:'冲击接近零'},{label:'市场',value:'波动收窄'}],
                        tableTitle:'缓冲期指标影响', tableData:[{indicator:'GDP',usImpact:'0',cnImpact:'0',trend:'stable'},{indicator:'股市',usImpact:'+2%',cnImpact:'+1%',trend:'up'}]
                    }
                };
                return base[this.selectedScenario] || base['conflict'];
            }
        },
        methods: {
            // payoff 计算：修复权重设置无效问题
            calculatePayoff(usStrategy,cnStrategy){
                let base;
                if(usStrategy==='合作'&&cnStrategy==='合作') base=[this.cooperationReward,this.cooperationReward];
                else if(usStrategy==='合作'&&cnStrategy==='对抗') base=[this.sucker,this.temptation];
                else if(usStrategy==='对抗'&&cnStrategy==='合作') base=[this.temptation,this.sucker];
                else base=[this.punishment,this.punishment];

                // 通过权重偏差调整整体收益，方便观察 slider 的影响
                const defaults = { gdp: 5, trade: 3, stock: 2 };
                const gdpAdj = (this.gdpWeight - defaults.gdp) * 0.06;    // 每单位偏差约影响6%
                const tradeAdj = (this.tradeWeight - defaults.trade) * 0.06;
                const stockAdj = (this.stockWeight - defaults.stock) * 0.06;
                const multiplier = Math.max(0.2, 1 + gdpAdj + tradeAdj + stockAdj); // 最小保护

                const aUS = base[0] * multiplier;
                const aCN = base[1] * multiplier;

                return [ Number(aUS.toFixed(4)), Number(aCN.toFixed(4)) ];
            },

            isNashEquilibrium(usStrategy,cnStrategy){
                const cur = this.calculatePayoff(usStrategy,cnStrategy);
                const S=['合作','对抗'];
                for(let alt of S) if(alt!==usStrategy){ const altp=this.calculatePayoff(alt,cnStrategy); if(altp[0] > cur[0]+1e-6) return false; }
                for(let alt of S) if(alt!==cnStrategy){ const altp=this.calculatePayoff(usStrategy,alt); if(altp[1] > cur[1]+1e-6) return false; }
                return true;
            },

            selectScenario(id){ this.selectedScenario = id; },

            generateAIRecommendation(){
                const cooperationScore = (100 - this.politicalPressure) * 0.3 + this.economicGrowth * 0.2 + (100 - this.techDependency) * 0.2 + this.negotiationLeverage * 0.15 + this.internationalSupport * 0.15;
                const tariffScore = this.currentTariff / 150 * 100;
                let recommendation;
                if(cooperationScore>70 && tariffScore<40) recommendation = { strategy:"积极推进合作", confidence:"85%", type:"cooperative", icon:"fas fa-handshake", reasoning:["政治压力较低，有合作空间","经济增长需求强烈"], actions:["提议双边关税减免至20%以下","建立定期磋商机制"]};
                else if(cooperationScore>50) recommendation = { strategy:"谨慎试探合作", confidence:"65%", type:"cautious", icon:"fas fa-exclamation-triangle", reasoning:["存在合作基础但仍有障碍"], actions:["暂停部分商品关税","开展技术交流对话"]};
                else recommendation = { strategy:"维持现状或适度施压", confidence:"45%", type:"defensive", icon:"fas fa-shield-alt", reasoning:["政治压力较大，合作空间有限"], actions:["保持现有关税水平","准备反制措施预案"]};
                this.aiRecommendation = recommendation;
                this.$nextTick(()=> this.renderAIMetricsChart(cooperationScore));
            },

            // 安全、稳健的 ECharts 实例管理
            _createChart(id){
                const el = document.getElementById(id);
                if(!el) return null;
                if (!this._charts || typeof this._charts !== 'object') this._charts = {};
                const prev = this._charts[id];
                if(prev){
                    try{
                        if (prev && typeof prev.dispose === 'function') prev.dispose();
                        else if (typeof echarts.dispose === 'function') echarts.dispose(prev);
                    }catch(e){}
                    this._charts[id] = null;
                }
                try {
                    const instance = echarts.init(el);
                    this._charts[id] = instance;
                    return instance;
                } catch (e) {
                    console.error('ECharts init 失败', id, e);
                    return null;
                }
            },

            // 在容器可见时安全渲染
            _safeRender(renderFn, id){
                const self = this;
                const call = () => { try { renderFn.call(self); } catch(e) { console.error('renderFn error', id, e); } };
                const el = document.getElementById(id);
                if(!el){
                    setTimeout(()=> {
                        const el2 = document.getElementById(id);
                        if(el2) call();
                    }, 80);
                } else {
                    const rect = el.getBoundingClientRect();
                    if(rect.width === 0 || rect.height === 0){
                        setTimeout(()=> {
                            call();
                            if(this._charts && this._charts[id] && typeof this._charts[id].resize === 'function') this._charts[id].resize();
                        }, 80);
                    } else {
                        call();
                        if(this._charts && this._charts[id] && typeof this._charts[id].resize === 'function') {
                            setTimeout(()=> this._charts[id].resize(), 50);
                        }
                    }
                }
            },
            
        // 博弈树：带剪枝、节点着色与图例（对抗/合作/最优）
        renderGameTreeChart(){
            this._safeRender(()=> {
                const chart = this._createChart('game-tree-chart'); if(!chart) return;

                const COLORS = {
                    defect: '#ff6b6b',      // 对抗策略（红）
                    cooperate: '#91cc75',   // 合作策略（绿）
                    optimal: '#f5c542',     // 最优结果（黄）
                    neutral: '#9fb8e2'      // 中性/默认（蓝灰）
                };

                // 根据两方动作判断叶子类型：双方合作视作最优
                const makeLeaf = (usStr, cnStr, noteShort, noteFull) => {
                    const p = this.calculatePayoff(usStr, cnStr);
                    const name = `${noteFull}\n(美:${p[0]}, 中:${p[1]})`;
                    let type = 'neutral';
                    if(usStr === '合作' && cnStr === '合作') type = 'optimal';
                    else if (usStr === '对抗' || cnStr === '对抗') type = 'defect';
                    else type = 'cooperate';
                    return {
                        name,
                        short: noteShort,
                        type
                    };
                };

                // 根据节点语义设置类型（简化规则）
                const node = (nameFull, nameShort, type='neutral', children=null, condition=true) => {
                    const n = { name: nameFull, short: nameShort, type };
                    if(children) n.children = children;
                    if(condition === false) n.condition = false;
                    return n;
                };

                // 剪枝依据：若当前关税高或合作意愿低，则删去“主动合作”分支
                const pruneCooperation = (this.currentTariff > 80) || ((this.customParams.cooperation||50) < 30);

                const raw = node('开始','开始','neutral', [
                    node('美：施压','施压','defect', [
                        node('中：对抗','对抗','defect', [
                            node('美：升级制裁','升级','defect', [
                                makeLeaf('对抗','对抗','全面升级','全面升级（持续恶化）'),
                                makeLeaf('对抗','对抗','长期僵持','长期僵持（无协议）')
                            ]),
                            node('美：谈判尝试','谈判','neutral', [
                                makeLeaf('对抗','合作','谈判失败','谈判失败（妥协不足）'),
                                makeLeaf('合作','对抗','被利用','被利用（短期损失）')
                            ])
                        ]),
                        node('中：有限妥协','有限妥协','cooperate', [
                            node('美：继续施压换让步','继续施压','defect', [
                                makeLeaf('对抗','合作','换让步','换取让步（有条件）'),
                                makeLeaf('对抗','合作','局部协议','局部协议（有限覆盖）')
                            ]),
                            node('美：接受局部协议','接受协议','cooperate', [
                                makeLeaf('合作','合作','短期和解','短期和解（缓冲）'),
                                makeLeaf('合作','合作','经济回暖','经济回暖（可持续）')
                            ])
                        ])
                    ]),

                    node('美：选择性合作/制裁','选择性','neutral', [
                        node('中：反制特定领域','反制','defect', [
                            node('美：加码或切换','加码/切换','defect', [
                                makeLeaf('对抗','对抗','技术战','技术战升级'),
                                makeLeaf('合作','对抗','贸易受挫','合作失败（贸易受挫）')
                            ]),
                            node('美：回归谈判桌','回归谈判','cooperate', [
                                makeLeaf('合作','合作','分阶段解除','分阶段解除限制'),
                                makeLeaf('合作','合作','技术合作','签署技术合作')
                            ], /* condition */ !pruneCooperation)
                        ]),
                        node('中：主动合作（有限开放）','主动合作','cooperate', [
                            node('美：扩大合作','扩大合作','cooperate', [
                                makeLeaf('合作','合作','互信','互信增强'),
                                makeLeaf('合作','合作','长期协议','长期协议（稳定）')
                            ]),
                            node('美：维持选择性合作','选择性合作','neutral', [
                                makeLeaf('合作','合作','局部改善','局部改善（缓慢）'),
                                makeLeaf('对抗','合作','政策再评估','政策再评估（不确定）')
                            ])
                        ], /* condition */ !pruneCooperation)
                    ]),

                    node('美：直接合作/降税','直接合作','cooperate', [
                        node('中：对等合作','对等合作','cooperate', [
                            node('双方：扩大合作范围','扩大合作','cooperate', [
                                makeLeaf('合作','合作','全面降税','全面降税（高增长）'),
                                makeLeaf('合作','合作','供应链重构','供应链重构（双赢）')
                            ]),
                            node('双方：长期协议','长期协议','cooperate', [
                                makeLeaf('合作','合作','长期稳定','长期稳定（低波动）'),
                                makeLeaf('合作','合作','投资增加','双边投资增加')
                            ])
                        ]),
                        node('中：保守合作','保守合作','cooperate', [
                            node('美：观察逐步开放','逐步开放','cooperate', [
                                makeLeaf('合作','合作','阶段改善','阶段性改善'),
                                makeLeaf('合作','合作','增长回升','增长回升（缓慢）')
                            ]),
                            node('美：预留反制选项','预留反制','neutral', [
                                makeLeaf('对抗','合作','短期不确定','短期不确定（波动）'),
                                makeLeaf('合作','对抗','反制风险','反制风险（需要观察）')
                            ])
                        ])
                    ], /* condition */ !pruneCooperation)
                ]);

                // 剪枝函数：移除 condition === false 的节点
                function prune(node){
                    if(!node) return null;
                    if(node.hasOwnProperty('condition') && node.condition === false) return null;
                    if(node.children && node.children.length){
                        const out = [];
                        for(const c of node.children){
                            const pc = prune(c);
                            if(pc) out.push(pc);
                        }
                        node.children = out;
                    }
                    return node;
                }

                const tree = prune(JSON.parse(JSON.stringify(raw))); // 深拷贝并剪枝

                // 递归给每个节点附加 itemStyle/label，用于上色与短标签显示
                function applyStyles(n){
                    if(!n) return;
                    const t = n.type || 'neutral';
                    n.itemStyle = { color: COLORS[t] || COLORS.neutral };
                    // 叶子显示完整 name in tooltip, label 显示 short（或截断）
                    n.label = n.label || {};
                    // 保留短标签（前面已有 short 字段）
                    n.label.color = '#222';
                    if(n.children && n.children.length) {
                        for(const c of n.children) applyStyles(c);
                    }
                }
                applyStyles(tree);

                // 截断显示函数（供 label formatter 使用）
                const truncate = (s, n=14) => (typeof s === 'string' && s.length>n) ? (s.slice(0,n-1)+'…') : s;

                const option = {
                    tooltip: {
                        trigger: 'item',
                        formatter: params => {
                            return params.data && params.data.name ? params.data.name.replace(/\n/g,'<br/>') : '';
                        }
                    },
                    graphic: [
                        // 简单图例：三个小圆 + 文本，右上角
                        {
                            type: 'group',
                            right: 20,
                            top: 20,
                            children: [
                                { type: 'circle', shape: { cx: 8, cy: 8, r: 6 }, style: { fill: COLORS.defect } },
                                { type: 'text', left: 20, top: -2, style: { text: '对抗策略', fill: '#333', font: '12px Microsoft YaHei' } },

                                { type: 'circle', shape: { cx: 8, cy: 28, r: 6 }, style: { fill: COLORS.cooperate } },
                                { type: 'text', left: 20, top: 18, style: { text: '合作策略', fill: '#333', font: '12px Microsoft YaHei' } },

                                { type: 'circle', shape: { cx: 8, cy: 48, r: 6 }, style: { fill: COLORS.optimal } },
                                { type: 'text', left: 20, top: 38, style: { text: '最优结果', fill: '#333', font: '12px Microsoft YaHei' } }
                            ]
                        }
                    ],
                    series: [{
                        type: 'tree',
                        data: [tree],
                        top: '8%',
                        left: '2%',
                        bottom: '8%',
                        right: '28%',
                        orient: 'horizontal', // 水平布局减少重叠
                        symbolSize: 8,
                        label: {
                            position: 'left',
                            verticalAlign: 'middle',
                            align: 'right',
                            fontSize: 11,
                            formatter: params => {
                                const d = params.data || {};
                                return d.short ? truncate(d.short, 16) : truncate((d.name||''), 16);
                            }
                        },
                        leaves: {
                            label: {
                                position: 'right',
                                verticalAlign: 'middle',
                                align: 'left',
                                color: '#333',
                                fontSize: 11,
                                formatter: params => {
                                    const d = params.data || {};
                                    return d.short ? truncate(d.short, 20) : truncate((d.name||''), 20);
                                }
                            }
                        },
                        expandAndCollapse: true,
                        initialTreeDepth: 2,
                        roam: true,
                        nodeGap: 18,
                        level: [{}, { level:1, width: 200 }, { level:2, width: 240 }, { level:3, width: 260 }],
                        levelGap: 140,
                        itemStyle: { borderWidth: 1 },
                        lineStyle: { color: '#cfe6ff', width: 1.2 }
                    }]
                };

                chart.clear();
                chart.setOption(option, true);
                setTimeout(()=> { try{ chart.resize(); }catch(e){} }, 60);
            }, 'game-tree-chart');
        },

            renderPathComparisonChart(){
                this._safeRender(()=> {
                    const chart = this._createChart('path-comparison-chart'); if(!chart) return;
                    const option = {
                        title:{text:'不同路径收益对比',left:'center'},
                        tooltip:{trigger:'axis'},
                        legend:{data:['对抗路径','合作路径'],top:30},
                        xAxis:{type:'category',data:['初始','中间','终局']},
                        yAxis:{type:'value',name:'收益'},
                        series:[
                            {name:'对抗路径', type:'line', data:[3,4,5], smooth:true, itemStyle:{color:'#ff6b6b'}},
                            {name:'合作路径', type:'line', data:[2,7,10], smooth:true, itemStyle:{color:'#4ecdc4'}}
                        ]
                    };
                    chart.setOption(option);
                }, 'path-comparison-chart');
            },

            renderMixedStrategyChart(){
                this._safeRender(()=> {
                    const chart = this._createChart('mixed-strategy-chart'); if(!chart) return;
                    const eq = this.mixedEquilibrium;
                    const option = {
                        title:{text:'混合策略对比',left:'center'},
                        tooltip:{},
                        legend:{data:['当前概率','理论均衡'],top:30},
                        xAxis:{type:'category',data:['美方合作率','中方合作率']},
                        yAxis:{type:'value',min:0,max:100},
                        series:[
                            {name:'当前概率', type:'bar', data:[this.pUS,this.pCN], itemStyle:{color:'#5470c6'}},
                            {name:'理论均衡', type:'bar', data:[Math.round(eq.p*100),Math.round(eq.q*100)], itemStyle:{color:'#91cc75'}}
                        ]
                    };
                    chart.setOption(option);
                }, 'mixed-strategy-chart');
            },

            renderSensitivityChart(){
                if(this.sensitivityRange[0] > this.sensitivityRange[1]) {
                    const tmp = this.sensitivityRange[0]; this.sensitivityRange[0] = this.sensitivityRange[1]; this.sensitivityRange[1] = tmp;
                }
                this._safeRender(()=> {
                    const chart = this._createChart('sensitivity-chart'); if(!chart) return;
                    const pRange = [], usPayoffs = [], cnPayoffs = [];
                    const start = this.sensitivityRange[0], end = this.sensitivityRange[1];
                    const steps = 20;
                    const step = Math.max(1, (end - start) / steps);
                    for(let perc = start; perc <= end + 1e-6; perc += step){
                        const p = perc / 100; pRange.push(Math.round(perc) + '%');
                        const q = this.pCN / 100;
                        const payoffCC = this.calculatePayoff('合作','合作');
                        const payoffCD = this.calculatePayoff('合作','对抗');
                        const payoffDC = this.calculatePayoff('对抗','合作');
                        const payoffDD = this.calculatePayoff('对抗','对抗');
                        const eUS = p*q*payoffCC[0] + p*(1-q)*payoffCD[0] + (1-p)*q*payoffDC[0] + (1-p)*(1-q)*payoffDD[0];
                        const eCN = p*q*payoffCC[1] + p*(1-q)*payoffCD[1] + (1-p)*q*payoffDC[1] + (1-p)*(1-q)*payoffDD[1];
                        usPayoffs.push(Number(eUS.toFixed(2))); cnPayoffs.push(Number(eCN.toFixed(2)));
                    }
                    const option = {
                        title:{text:'美方合作概率对期望收益的影响',left:'center'},
                        tooltip:{trigger:'axis'},
                        legend:{data:['美方期望收益','中方期望收益'],top:30},
                        xAxis:{type:'category',data:pRange},
                        yAxis:{type:'value',name:'期望收益'},
                        series:[
                            {name:'美方期望收益', type:'line', data:usPayoffs, itemStyle:{color:'#5470c6'}},
                            {name:'中方期望收益', type:'line', data:cnPayoffs, itemStyle:{color:'#91cc75'}}
                        ]
                    };
                    chart.setOption(option);
                }, 'sensitivity-chart');
            },

            renderLongTermChart(){
                this._safeRender(()=> {
                    const chart = this._createChart('long-term-chart'); if(!chart) return;
                    const months = Array.from({length:12},(_,i)=>`${i+1}月`);
                    const us = [ -50,-120,-300,-600,-400,-200,-100,-50,-20,-10,-5,0 ];
                    const cn = [ -40,-100,-250,-500,-350,-180,-90,-40,-10,-5,0,0 ];
                    const option = {
                        title:{text:'缓冲期长期影响预测',left:'center'},
                        tooltip:{trigger:'axis'},
                        legend:{data:['美方GDP冲击','中方GDP冲击'],top:30},
                        xAxis:{type:'category',data:months},
                        yAxis:{type:'value',name:'冲击(亿美元)'},
                        series:[
                            {name:'美方GDP冲击', type:'line', data:us, smooth:true, itemStyle:{color:'#ff6b6b'}},
                            {name:'中方GDP冲击', type:'line', data:cn, smooth:true, itemStyle:{color:'#4ecdc4'}}
                        ]
                    };
                    chart.setOption(option);
                }, 'long-term-chart');
            },

            renderAIMetricsChart(cooperationScore){
                this._safeRender(()=> {
                    const chart = this._createChart('ai-metrics-chart'); if(!chart) return;
                    const tariffScore = this.currentTariff / 150 * 100;
                    const option = {
                        title:{text:'AI 分析指标',left:'center'},
                        tooltip:{},
                        xAxis:{type:'category',data:['合作倾向','关税强度','谈判筹码','国际支持']},
                        yAxis:{type:'value',min:0,max:100},
                        series:[{
                            name:'指标值',
                            type:'bar',
                            data:[
                                Math.round(cooperationScore),
                                Math.round(tariffScore),
                                Math.round(this.negotiationLeverage),
                                Math.round(this.internationalSupport)
                            ],
                            itemStyle:{color:'#1976d2'}
                        }]
                    };
                    chart.setOption(option);
                }, 'ai-metrics-chart');
            },

            getTrendText(trend){ if(trend==='up') return '上升'; if(trend==='down') return '下降'; if(trend==='stable') return '持平'; return '未知'; },
            getRecommendationClass(score){ if(score>=70) return 'success'; if(score>=40) return 'warning'; return 'error'; },
            getRecommendationText(score){ if(score>=70) return '风险较低：建议推进合作或降税措施。'; if(score>=40) return '中等风险：建议谨慎推进，分阶段试探合作。'; return '风险较高：建议维持现状并准备应对措施。'; },

            initCharts(){
                this.$nextTick(()=> {
                    if(this.currentPage==='dynamic'){ this.renderGameTreeChart(); this.renderPathComparisonChart(); }
                    if(this.currentPage==='mixed'){ this.renderMixedStrategyChart(); this.renderSensitivityChart(); }
                    if(this.currentPage==='scenario' && this.selectedScenario==='buffer'){ this.renderLongTermChart(); }
                    if(this.currentPage==='ai' && this.aiRecommendation) this.renderAIMetricsChart( (100 - this.politicalPressure) * 0.3 + this.economicGrowth * 0.2 + (100 - this.techDependency) * 0.2 + this.negotiationLeverage * 0.15 + this.internationalSupport * 0.15 );
                });
            }
        },
        watch: {
            currentPage(){ this.$nextTick(()=> this.initCharts()); },
            pUS(){ if(this.currentPage==='mixed') this.$nextTick(()=>{ this.renderMixedStrategyChart(); this.renderSensitivityChart(); }); },
            pCN(){ if(this.currentPage==='mixed') this.$nextTick(()=>{ this.renderMixedStrategyChart(); this.renderSensitivityChart(); }); },
            sensitivityRange:{ handler(){ if(this.currentPage==='mixed') this.$nextTick(()=> this.renderSensitivityChart()); }, deep:true },
            selectedScenario(){ this.$nextTick(()=> { if(this.currentPage==='scenario' && this.selectedScenario==='buffer') this.renderLongTermChart(); }) }
        },
        mounted(){
            console.log('中美关税博弈仿真系统脚本已初始化');
            this.$nextTick(()=> this.initCharts());
            window.addEventListener('resize', ()=> {
                if (!this._charts) return;
                for(const k in this._charts) try{ if(this._charts[k] && typeof this._charts[k].resize === 'function') this._charts[k].resize(); }catch(e){}
            });
        }
    });
})();