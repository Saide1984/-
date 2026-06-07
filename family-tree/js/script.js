(function () {
    'use strict';

    let familyData = loadFamilyData();
    let zoom = 1;
    let panX = 0, panY = 0;
    let isDragging = false;
    let dragStartX, dragStartY;

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // === INIT ===
    function init() {
        renderTree();
        updateStats();
        bindEvents();
        loadSettings();
    }

    // === RENDER TREE ===
    function renderTree() {
        const treeCanvas = $('#treeCanvas');
        const connectionsGroup = $('#connectionsGroup');
        if (!treeCanvas || !connectionsGroup) return;

        treeCanvas.querySelectorAll('.person-card, .generation, .family-branch').forEach(el => el.remove());
        connectionsGroup.innerHTML = '';

        // Find root ancestors (no parentId)
        const rootMembers = familyData.filter(m => !m.parentId);

        // Group by couples - support multiple spouses
        const processedIds = new Set();
        const couples = [];

        rootMembers.forEach(member => {
            if (processedIds.has(member.id)) return;
            processedIds.add(member.id);

            const spouseIds = (member.spouses || []).map(s => s.id).filter(id => id != null);
            const spouseNames = (member.spouses || []).filter(s => s.id == null).map(s => s.name);
            spouseIds.forEach(id => processedIds.add(id));

            const spouseMembers = spouseIds.map(id => familyData.find(m => m.id === id)).filter(Boolean);

            couples.push({ main: member, spouses: spouseMembers, spouseNames: spouseNames });
        });

        // Build tree structure
        const treeStructure = {
            generations: []
        };

        // Generation 1: Root ancestors as couples
        const gen1 = document.createElement('div');
        gen1.className = 'generation generation-root';
        gen1.dataset.generation = '1';

        couples.forEach(couple => {
            const familyUnit = document.createElement('div');
            familyUnit.className = 'family-unit';
            familyUnit.appendChild(createPersonCard(couple.main));

            // Add all spouses
            couple.spouses.forEach((spouse, idx) => {
                const spouseConnector = document.createElement('div');
                spouseConnector.className = 'spouse-connector';
                spouseConnector.innerHTML = '<span class="spouse-line">— 💍 —</span>';
                familyUnit.appendChild(spouseConnector);
                familyUnit.appendChild(createPersonCard(spouse));
            });

            // Add text-only spouse names
            couple.spouseNames.forEach(name => {
                const spouseConnector = document.createElement('div');
                spouseConnector.className = 'spouse-connector';
                spouseConnector.innerHTML = '<span class="spouse-line">— 💍 —</span>';
                familyUnit.appendChild(spouseConnector);

                const textSpouse = document.createElement('div');
                textSpouse.className = 'person-card spouse-text-card';
                textSpouse.innerHTML = `
                    <div class="card-photo">
                        <div class="photo-placeholder">${couple.main.gender === 'male' ? '👩' : '👨'}</div>
                    </div>
                    <div class="card-info">
                        <div class="card-name">${name}</div>
                        <div class="card-role">${couple.main.gender === 'male' ? 'زوجة' : 'زوج'}</div>
                    </div>
                `;
                familyUnit.appendChild(textSpouse);
            });

            gen1.appendChild(familyUnit);
        });

        treeCanvas.appendChild(gen1);

        // Build children tree recursively
        function buildChildrenBranch(parentId, container, level) {
            const children = familyData.filter(m => m.parentId === parentId);
            if (children.length === 0) return;

            const childrenRow = document.createElement('div');
            childrenRow.className = 'children-row';
            childrenRow.dataset.level = level;

            children.forEach(child => {
                const childBranch = document.createElement('div');
                childBranch.className = 'child-branch';
                childBranch.appendChild(createPersonCard(child));

                // Check for grandchildren
                const grandchildren = familyData.filter(m => m.parentId === child.id);
                if (grandchildren.length > 0) {
                    buildChildrenBranch(child.id, childBranch, level + 1);
                }

                childrenRow.appendChild(childBranch);
            });

            container.appendChild(childrenRow);
        }

        // Find direct children of root members
        const rootIds = rootMembers.map(m => m.id);
        const directChildren = familyData.filter(m => m.parentId && rootIds.includes(m.parentId));

        if (directChildren.length > 0) {
            const gen2 = document.createElement('div');
            gen2.className = 'generation generation-children';
            gen2.dataset.generation = '2';

            // Vertical connector from parents to children
            const verticalConnector = document.createElement('div');
            verticalConnector.className = 'vertical-connector';
            verticalConnector.innerHTML = '<div class="connector-line"></div>';
            gen2.appendChild(verticalConnector);

            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children-container';

            directChildren.forEach(child => {
                const childBranch = document.createElement('div');
                childBranch.className = 'child-branch';
                childBranch.appendChild(createPersonCard(child));

                // Recursively build grandchildren
                const grandchildren = familyData.filter(m => m.parentId === child.id);
                if (grandchildren.length > 0) {
                    buildChildrenBranch(child.id, childBranch, 3);
                }

                childrenContainer.appendChild(childBranch);
            });

            gen2.appendChild(childrenContainer);
            treeCanvas.appendChild(gen2);
        }

        requestAnimationFrame(() => drawConnections());
    }

    function createPersonCard(member) {
        const card = document.createElement('div');
        card.className = 'person-card' + (member.deathDate ? ' deceased' : '');
        card.dataset.memberId = member.id;

        const isDeceased = !!member.deathDate;
        const photoSrc = member.photo || 'images/default.svg';

        let datesHtml = '';
        if (member.birthDate || member.birthPlace) {
            datesHtml += '<div class="date-line">🎂 ' + formatBirth(member) + '</div>';
        }
        if (isDeceased) {
            datesHtml += '<div class="date-line">✝ ' + formatDeath(member) + '</div>';
        }

        // Show all spouse names - handle both old and new format
        const spouseSet = new Set();
        (member.spouses || []).forEach(s => {
            if (s.id) {
                const spouseMember = familyData.find(m => m.id === s.id);
                if (spouseMember) spouseSet.add(spouseMember.name);
            } else if (s.name) {
                spouseSet.add(s.name);
            }
        });
        // Fallback for old format
        if (member.spouseName && member.spouseName.trim()) {
            spouseSet.add(member.spouseName.trim());
        }
        const spouseNames = [...spouseSet];
        if (spouseNames.length > 0) {
            datesHtml += '<div class="date-line spouse-line-text">💑 ' + spouseNames.join('، ') + '</div>';
        }

        card.innerHTML = `
            <div class="card-photo">
                <img src="${photoSrc}" alt="${member.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="photo-placeholder" style="display:none">${member.gender === 'female' ? '👩' : '👨'}</div>
                ${isDeceased ? '<div class="death-indicator">✝</div>' : ''}
            </div>
            <div class="card-info">
                <div class="card-name">${member.name}</div>
                <div class="card-role">${member.role}</div>
                <div class="card-dates">${datesHtml}</div>
            </div>
            <button class="card-add-child" title="إضافة ابن/ابنة" data-member-id="${member.id}">+</button>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.card-add-child')) {
                e.stopPropagation();
                openAddForm(member.id);
                return;
            }
            openMemberModal(member.id);
        });

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, member.id);
        });
        return card;
    }

    function formatBirth(m) {
        let parts = [];
        if (m.birthDate) parts.push(m.birthDate);
        if (m.birthPlace) parts.push(m.birthPlace);
        return parts.join(' - ') || '';
    }

    function formatDeath(m) {
        let parts = [];
        if (m.deathDate) parts.push(m.deathDate);
        if (m.deathPlace) parts.push(m.deathPlace);
        return parts.join(' - ') || '';
    }

    // === DRAW CONNECTIONS ===
    function drawConnections() {
        const svg = $('#connectionsSvg');
        const group = $('#connectionsGroup');
        const canvas = $('#treeCanvas');
        if (!svg || !group || !canvas) return;

        const canvasRect = canvas.getBoundingClientRect();
        svg.setAttribute('width', canvas.scrollWidth);
        svg.setAttribute('height', canvas.scrollHeight);
        svg.style.width = canvas.scrollWidth + 'px';
        svg.style.height = canvas.scrollHeight + 'px';
        group.innerHTML = '';

        // Draw parent-child connections
        familyData.forEach(member => {
            if (!member.parentId) return;
            const childCard = canvas.querySelector(`[data-member-id="${member.id}"]`);
            const parentCard = canvas.querySelector(`[data-member-id="${member.parentId}"]`);
            if (!childCard || !parentCard) return;

            const childRect = childCard.getBoundingClientRect();
            const parentRect = parentCard.getBoundingClientRect();

            const x1 = parentRect.left + parentRect.width / 2 - canvasRect.left + canvas.scrollLeft;
            const y1 = parentRect.top + parentRect.height - canvasRect.top + canvas.scrollTop;
            const x2 = childRect.left + childRect.width / 2 - canvasRect.left + canvas.scrollLeft;
            const y2 = childRect.top - canvasRect.top + canvas.scrollTop;

            const midY = (y1 + y2) / 2;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
            path.setAttribute('stroke', '#e8d5a8');
            path.setAttribute('stroke-width', '3');
            path.setAttribute('fill', 'none');
            path.setAttribute('filter', 'url(#lineGlow)');
            group.appendChild(path);
        });

        // Draw spouse connections - support multiple spouses
        const drawnSpouseConnections = new Set();
        familyData.forEach(member => {
            const spouses = member.spouses || [];
            spouses.forEach(spouse => {
                if (spouse.id == null) return;
                const key = Math.min(member.id, spouse.id) + '-' + Math.max(member.id, spouse.id);
                if (drawnSpouseConnections.has(key)) return;
                drawnSpouseConnections.add(key);

                const card1 = canvas.querySelector(`[data-member-id="${member.id}"]`);
                const card2 = canvas.querySelector(`[data-member-id="${spouse.id}"]`);
                if (!card1 || !card2) return;

                const r1 = card1.getBoundingClientRect();
                const r2 = card2.getBoundingClientRect();

                const x1 = r1.left + r1.width / 2 - canvasRect.left + canvas.scrollLeft;
                const y1 = r1.top + r1.height / 2 - canvasRect.top + canvas.scrollTop;
                const x2 = r2.left + r2.width / 2 - canvasRect.left + canvas.scrollLeft;
                const y2 = r2.top + r2.height / 2 - canvasRect.top + canvas.scrollTop;

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', x1);
                line.setAttribute('y1', y1);
                line.setAttribute('x2', x2);
                line.setAttribute('y2', y2);
                line.setAttribute('stroke', '#d4a017');
                line.setAttribute('stroke-width', '2');
                line.setAttribute('stroke-dasharray', '6,4');
                line.setAttribute('opacity', '0.7');
                group.appendChild(line);

                const heart = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                heart.setAttribute('x', (x1 + x2) / 2);
                heart.setAttribute('y', (y1 + y2) / 2);
                heart.setAttribute('text-anchor', 'middle');
                heart.setAttribute('dominant-baseline', 'central');
                heart.setAttribute('font-size', '16');
                heart.textContent = '💍';
                group.appendChild(heart);
            });
        });
    }

    // === MODAL ===
    function openMemberModal(memberId) {
        const member = familyData.find(m => m.id === memberId);
        if (!member) return;

        const modal = $('#memberModal');
        const body = $('#modalBody');
        const isDeceased = !!member.deathDate;
        const photoSrc = member.photo || 'images/default.svg';

        let infoItems = '';
        infoItems += infoItem('📛', 'الاسم الكامل', member.name);
        infoItems += infoItem('👤', 'الصفة', member.role);
        infoItems += infoItem('⚧', 'الجنس', member.gender === 'male' ? 'ذكر' : 'أنثى');
        if (member.birthDate) infoItems += infoItem('🎂', 'تاريخ الازدياد', member.birthDate);
        if (member.birthPlace) infoItems += infoItem('📍', 'مكان الازدياد', member.birthPlace);
        if (isDeceased) {
            if (member.deathDate) infoItems += infoItem('✝', 'تاريخ الوفاة', member.deathDate);
            if (member.deathPlace) infoItems += infoItem('📍', 'مكان الوفاة', member.deathPlace);
        }

        const parent = member.parentId ? familyData.find(m => m.id === member.parentId) : null;

        // Father name - from field or from parent
        const fatherName = member.fatherName || getFatherName(member);
        if (fatherName) infoItems += infoItem('👨', 'اسم الاب', fatherName);

        // Mother name - from field or from parent
        const motherName = member.motherName || getMotherName(member);
        if (motherName) infoItems += infoItem('👩', 'اسم الام', motherName);

        if (parent && !fatherName && !motherName) infoItems += infoItem('👨', 'الوالد', parent.name);

        // Show all spouses
        const spouseNames = (member.spouses || [])
            .map(s => {
                if (s.id) {
                    const spouseMember = familyData.find(m => m.id === s.id);
                    return spouseMember ? spouseMember.name : '';
                }
                return s.name || '';
            })
            .filter(name => name);
        if (spouseNames.length > 0) {
            infoItems += infoItem('💑', 'الزوج/ة', spouseNames.join('، '));
        }

        const childrenList = familyData.filter(m => m.parentId === member.id);
        if (childrenList.length > 0) {
            infoItems += infoItem('👶', 'الأبناء', childrenList.map(c => c.name).join('، '));
        }

        let notesHtml = '';
        if (member.notes) {
            notesHtml = `
                <div class="modal-notes">
                    <div class="modal-notes-label">ملاحظات</div>
                    <div class="modal-notes-text">${member.notes}</div>
                </div>`;
        }

        body.innerHTML = `
            <div class="modal-photo">
                <img src="${photoSrc}" alt="${member.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="modal-photo-placeholder" style="display:none">${member.gender === 'female' ? '👩' : '👨'}</div>
            </div>
            <div class="modal-details">
                <div class="modal-name">${member.name}</div>
                <div class="modal-role">${member.role} ${isDeceased ? '(رحمه الله)' : ''}</div>
                <div class="modal-info-grid">${infoItems}</div>
                ${notesHtml}
            </div>
            <div class="modal-actions">
                <button class="btn-primary" onclick="window.FamilyApp.editMember(${member.id})">✏️ تعديل</button>
                <button class="btn-danger" onclick="window.FamilyApp.deleteMember(${member.id})">🗑️ حذف</button>
            </div>
        `;

        modal.classList.add('active');
        $('#overlay').classList.add('active');
    }

    function infoItem(icon, label, value) {
        return `
            <div class="modal-info-item">
                <div class="modal-info-icon">${icon}</div>
                <div class="modal-info-text">
                    <div class="modal-info-label">${label}</div>
                    <div class="modal-info-value">${value}</div>
                </div>
            </div>`;
    }

    function closeModal() {
        $('#memberModal').classList.remove('active');
        $('#overlay').classList.remove('active');
    }

    // === FORM ===
    function openAddForm(parentId) {
        const panel = $('#addPanel');
        const form = $('#addForm');
        const title = $('#formTitle');
        const deleteBtn = $('#deleteBtn');

        form.reset();
        $('#editId').value = '';
        $('#fieldPhoto').value = 'images/default.svg';
        $('#imagePreview').innerHTML = '<span class="image-preview-text">انقر لاختيار صورة</span>';
        $('#removeImageBtn').style.display = 'none';
        deleteBtn.style.display = 'none';
        title.textContent = 'إضافة عضو جديد';

        // Clear spouse reference and spouses list
        delete form.dataset.spouseFor;
        form.dataset.spouses = '[]';
        renderSpousesList([]);

        if (parentId) {
            const parent = familyData.find(m => m.id === parentId);
            if (parent) {
                const roleSelect = $('#fieldRole');
                if (parent.gender === 'male') {
                    roleSelect.value = 'ابن';
                } else {
                    roleSelect.value = 'ابنة';
                }

                // Auto-fill parent names
                $('#fieldFatherName').value = parent.gender === 'male' ? parent.name : (getFatherName(parent) || '');
                $('#fieldMotherName').value = parent.gender === 'female' ? parent.name : (getMotherName(parent) || '');

                // Store parent reference
                form.dataset.parentId = parentId;
            }
        } else {
            $('#fieldFatherName').value = '';
            $('#fieldMotherName').value = '';
            delete form.dataset.parentId;
        }

        panel.classList.add('active');
        $('#overlay').classList.add('active');
    }

    function getFatherName(member) {
        if (member.fatherName) return member.fatherName;
        if (member.parentId) {
            const parent = familyData.find(m => m.id === member.parentId);
            if (parent && parent.gender === 'male') return parent.name;
        }
        return '';
    }

    function getMotherName(member) {
        if (member.motherName) return member.motherName;
        if (member.parentId) {
            const parent = familyData.find(m => m.id === member.parentId);
            if (parent && parent.gender === 'female') return parent.name;
        }
        return '';
    }

    function openEditForm(memberId) {
        const member = familyData.find(m => m.id === memberId);
        if (!member) return;

        const panel = $('#addPanel');
        const form = $('#addForm');
        const title = $('#formTitle');
        const deleteBtn = $('#deleteBtn');

        title.textContent = 'تعديل بيانات العضو';
        deleteBtn.style.display = 'block';

        // Clear any spouse/parent references
        delete form.dataset.spouseFor;
        delete form.dataset.parentId;

        $('#editId').value = member.id;
        $('#fieldName').value = member.name;
        $('#fieldRole').value = member.role;
        $('#fieldGender').value = member.gender;
        $('#fieldBirthPlace').value = member.birthPlace || '';
        $('#fieldBirthDate').value = member.birthDate || '';
        $('#fieldFatherName').value = member.fatherName || getFatherName(member) || '';
        $('#fieldMotherName').value = member.motherName || getMotherName(member) || '';
        $('#fieldDeathPlace').value = member.deathPlace || '';
        $('#fieldDeathDate').value = member.deathDate || '';
        $('#fieldNotes').value = member.notes || '';
        $('#fieldPhoto').value = member.photo || 'images/default.svg';

        // Load spouses list
        form.dataset.spouses = JSON.stringify(member.spouses || []);
        renderSpousesList(member.spouses || []);

        if (member.photo && member.photo !== 'images/default.svg') {
            $('#imagePreview').innerHTML = `<img src="${member.photo}" alt="${member.name}">`;
            $('#removeImageBtn').style.display = 'inline-block';
        } else {
            $('#imagePreview').innerHTML = '<span class="image-preview-text">انقر لاختيار صورة</span>';
            $('#removeImageBtn').style.display = 'none';
        }

        panel.classList.add('active');
        $('#overlay').classList.add('active');
        closeModal();
    }

    function closeForm() {
        const form = $('#addForm');
        delete form.dataset.spouseFor;
        delete form.dataset.parentId;
        $('#addPanel').classList.remove('active');
        $('#overlay').classList.remove('active');
    }

    function handleFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const editId = $('#editId').value;
        const photoInput = $('#fieldPhoto').value || 'images/default.svg';
        const spouseFor = form.dataset.spouseFor;
        const parentId = form.dataset.parentId;

        const memberData = {
            name: $('#fieldName').value.trim(),
            role: $('#fieldRole').value,
            gender: $('#fieldGender').value,
            birthPlace: $('#fieldBirthPlace').value.trim(),
            birthDate: $('#fieldBirthDate').value.trim(),
            fatherName: $('#fieldFatherName').value.trim(),
            motherName: $('#fieldMotherName').value.trim(),
            deathPlace: $('#fieldDeathPlace').value.trim(),
            deathDate: $('#fieldDeathDate').value.trim(),
            notes: $('#fieldNotes').value.trim(),
            photo: photoInput
        };

        if (editId) {
            const idx = familyData.findIndex(m => m.id === parseInt(editId));
            if (idx !== -1) {
                familyData[idx] = { ...familyData[idx], ...memberData };
            }
        } else {
            memberData.id = getNextId(familyData);
            memberData.spouses = form.dataset.spouses ? JSON.parse(form.dataset.spouses) : [];

            // Handle spouse relationship
            if (spouseFor) {
                const spouseMember = familyData.find(m => m.id === parseInt(spouseFor));
                if (spouseMember) {
                    memberData.parentId = spouseMember.parentId;
                    // Add to the original member's spouses array
                    if (!spouseMember.spouses) spouseMember.spouses = [];
                    spouseMember.spouses.push({ id: memberData.id });
                }
            } else if (parentId) {
                // Handle child relationship
                memberData.parentId = parseInt(parentId);
            }

            familyData.push(memberData);
        }

        // Clean up form dataset
        delete form.dataset.spouseFor;
        delete form.dataset.parentId;
        delete form.dataset.spouses;

        saveFamilyData(familyData);
        renderTree();
        updateStats();
        closeForm();
    }

    function deleteMember(memberId) {
        if (!confirm('هل أنت متأكد من حذف هذا العضو؟')) return;
        familyData = familyData.filter(m => m.id !== memberId);
        familyData.forEach(m => {
            // Clean up spouse references in the new format
            if (m.spouses) {
                m.spouses = m.spouses.filter(s => s.id !== memberId);
            }
            if (m.parentId === memberId) m.parentId = null;
        });
        saveFamilyData(familyData);
        renderTree();
        updateStats();
        closeModal();
    }

    function editMember(memberId) {
        openEditForm(memberId);
    }

    // === SPOUSES LIST IN FORM ===
    function renderSpousesList(spouses) {
        const container = $('#spousesList');
        if (!container) return;
        const form = $('#addForm');
        form.dataset.spouses = JSON.stringify(spouses);

        if (!spouses || spouses.length === 0) {
            container.innerHTML = '<div class="spouse-tag-empty">لم تُضف زوجات بعد</div>';
            return;
        }

        container.innerHTML = spouses.map((s, i) => {
            let name = '';
            if (s.id) {
                const member = familyData.find(m => m.id === s.id);
                name = member ? member.name : 'غير معروف';
            } else {
                name = s.name || '';
            }
            return `<div class="spouse-tag">
                <span>💑 ${name}</span>
                <button type="button" class="spouse-tag-remove" data-index="${i}">✕</button>
            </div>`;
        }).join('');

        container.querySelectorAll('.spouse-tag-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                spouses.splice(idx, 1);
                form.dataset.spouses = JSON.stringify(spouses);
                renderSpousesList(spouses);
            });
        });
    }

    function addSpouseByName() {
        const input = $('#fieldSpouseName');
        const name = input.value.trim();
        if (!name) return;

        const form = $('#addForm');
        const spouses = form.dataset.spouses ? JSON.parse(form.dataset.spouses) : [];
        spouses.push({ id: null, name: name });
        form.dataset.spouses = JSON.stringify(spouses);
        renderSpousesList(spouses);
        input.value = '';
    }

    // === SEARCH ===
    function handleSearch(query) {
        const results = $('#searchResults');
        if (!query.trim()) {
            results.innerHTML = '';
            return;
        }

        const filtered = familyData.filter(m =>
            m.name.includes(query) || m.role.includes(query) || (m.birthPlace && m.birthPlace.includes(query))
        );

        if (filtered.length === 0) {
            results.innerHTML = '<div class="no-results">لا توجد نتائج</div>';
            return;
        }

        results.innerHTML = filtered.map(m => `
            <div class="search-result-item" data-id="${m.id}">
                <div class="search-result-avatar">
                    <img src="${m.photo || 'images/default.svg'}" alt="${m.name}">
                </div>
                <div class="search-result-info">
                    <div class="search-result-name">${m.name}</div>
                    <div class="search-result-role">${m.role}</div>
                </div>
            </div>
        `).join('');

        results.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                openMemberModal(parseInt(item.dataset.id));
                $('#searchPanel').classList.remove('active');
                $('#overlay').classList.remove('active');
            });
        });
    }

    // === STATS ===
    function updateStats() {
        const total = familyData.length;
        const deceased = familyData.filter(m => m.deathDate).length;
        const living = total - deceased;

        $('#totalMembers').textContent = total;
        $('#deceasedCount').textContent = deceased;
        $('#livingCount').textContent = living;
    }

    // === ZOOM ===
    function setZoom(newZoom) {
        zoom = Math.max(0.3, Math.min(2, newZoom));
        const canvas = $('#treeCanvas');
        if (canvas) {
            canvas.style.transform = `scale(${zoom})`;
        }
    }

    // === SETTINGS ===
    function loadSettings() {
        const settings = JSON.parse(localStorage.getItem('familyTreeSettings') || '{}');
        if (settings.bgColor) {
            document.documentElement.style.setProperty('--bg-primary', settings.bgColor);
        }
        if (settings.fontSize) {
            document.documentElement.style.fontSize = settings.fontSize + 'px';
        }
        if (settings.bgColor) {
            $$('.color-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.color === settings.bgColor);
            });
        }
    }

    function saveSettings(key, value) {
        const settings = JSON.parse(localStorage.getItem('familyTreeSettings') || '{}');
        settings[key] = value;
        localStorage.setItem('familyTreeSettings', JSON.stringify(settings));
    }

    // === EXPORT / IMPORT ===
    function exportData() {
        const blob = new Blob([JSON.stringify(familyData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'family-tree-data.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const data = JSON.parse(e.target.result);
                if (Array.isArray(data)) {
                    familyData = data;
                    saveFamilyData(familyData);
                    renderTree();
                    updateStats();
                    alert('تم الاستيراد بنجاح!');
                }
            } catch (err) {
                alert('خطأ في ملف البيانات');
            }
        };
        reader.readAsText(file);
    }

    function resetData() {
        if (!confirm('هل تريد إعادة تعيين البيانات؟ سيؤدي هذا إلى حذف جميع التغييرات.')) return;
        familyData = [...DEFAULT_FAMILY_DATA];
        saveFamilyData(familyData);
        renderTree();
        updateStats();
    }

    // === IMAGE HANDLING ===
    const IMG_MAX_SIZE = 400;
    const IMG_QUALITY = 0.8;

    function compressImage(fileOrUrl, maxSize = IMG_MAX_SIZE, quality = IMG_QUALITY) {
        return new Promise((resolve, reject) => {
            const processImage = (src) => {
                const img = new Image();
                if (typeof fileOrUrl === 'string' && /^https?:/i.test(fileOrUrl)) {
                    img.crossOrigin = 'anonymous';
                }
                img.onerror = () => reject(new Error('Image load failed'));
                img.onload = () => {
                    try {
                        let { width, height } = img;
                        if (width > height) {
                            if (width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; }
                        } else {
                            if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; }
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, width, height);
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    } catch (err) { reject(err); }
                };
                img.src = src;
            };

            if (typeof fileOrUrl === 'string') {
                processImage(fileOrUrl);
            } else {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('File read failed'));
                reader.onload = (e) => processImage(e.target.result);
                reader.readAsDataURL(fileOrUrl);
            }
        });
    }

    async function handleImageUpload(file) {
        if (!file || !file.type.startsWith('image/')) return;
        showNotification('جاري ضغط الصورة...', 'info');
        try {
            const originalKb = Math.round(file.size / 1024);
            const dataUrl = await compressImage(file);
            const compressedKb = Math.round((dataUrl.length * 3) / 4 / 1024);
            $('#fieldPhoto').value = dataUrl;
            $('#imagePreview').innerHTML = `<img src="${dataUrl}" alt="Preview">`;
            $('#removeImageBtn').style.display = 'inline-block';
            showNotification(`تم ضغط الصورة: ${originalKb}KB → ${compressedKb}KB`, 'success');
        } catch (err) {
            console.error(err);
            showNotification('فشل ضغط الصورة', 'error');
        }
    }

    function removeImage() {
        $('#fieldPhoto').value = 'images/default.svg';
        $('#imagePreview').innerHTML = '<span class="image-preview-text">انقر لاختيار صورة</span>';
        $('#removeImageBtn').style.display = 'none';
    }

    // === NOTIFICATIONS ===
    let notificationTimer = null;
    function showNotification(message, type = 'info') {
        let toast = $('#toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.className = 'toast toast-' + type + ' active';
        clearTimeout(notificationTimer);
        notificationTimer = setTimeout(() => toast.classList.remove('active'), 3000);
    }

    // === EMBED / EXPORT HTML ===
    async function embedImagesInData(data) {
        const result = JSON.parse(JSON.stringify(data));
        for (const member of result) {
            if (!member.photo || member.photo.startsWith('data:')) continue;
            if (member.photo === 'images/default.svg') continue;
            try {
                member.photo = await compressImage(member.photo);
            } catch (e) {
                member.photo = 'images/default.svg';
            }
        }
        return result;
    }

    async function getInlinedCSS() {
        let css = '';
        for (const sheet of document.styleSheets) {
            let rules = null;
            try { rules = sheet.cssRules || sheet.rules; } catch (e) { rules = null; }

            if (rules) {
                for (const rule of rules) css += rule.cssText + '\n';
            } else if (sheet.href) {
                if (sheet.href.includes('fonts.googleapis.com') || sheet.href.includes('fonts.gstatic.com')) {
                    css += `@import url('${sheet.href}');\n`;
                } else {
                    try {
                        const resp = await fetch(sheet.href);
                        if (resp.ok) css += await resp.text() + '\n';
                    } catch (e) {
                        console.warn('Could not load CSS:', sheet.href);
                    }
                }
            }
        }
        return css;
    }

    async function getInlinedJS() {
        const scripts = document.querySelectorAll('script[src]');
        let js = '';
        for (const script of scripts) {
            try {
                const resp = await fetch(script.src);
                if (resp.ok) js += '\n/* ' + script.getAttribute('src') + ' */\n' + await resp.text() + '\n';
            } catch (e) {
                console.warn('Could not load script:', script.src);
                return null;
            }
        }
        return js;
    }

    async function buildCompleteHTML() {
        const css = await getInlinedCSS();
        const embeddedData = await embedImagesInData(familyData);
        const dataJson = JSON.stringify(embeddedData);
        let js = await getInlinedJS();

        const docClone = document.documentElement.cloneNode(true);
        docClone.querySelectorAll('link[rel="stylesheet"], script, #toast').forEach(el => el.remove());
        docClone.querySelectorAll('.active').forEach(el => el.classList.remove('active'));

        if (js) {
            docClone.querySelectorAll('.tree-canvas .person-card, .tree-canvas .generation, .tree-canvas .family-branch, .tree-canvas .children-row, .tree-canvas .vertical-connector, .tree-canvas .children-container').forEach(el => el.remove());
            const connGroup = docClone.querySelector('#connectionsGroup');
            if (connGroup) connGroup.innerHTML = '';
        } else {
            const cardImages = docClone.querySelectorAll('.tree-canvas img, .modal-photo img');
            const originalImages = document.querySelectorAll('.tree-canvas img, .modal-photo img');
            originalImages.forEach((origImg, i) => {
                if (cardImages[i] && origImg.src && !origImg.src.startsWith('data:')) {
                    cardImages[i].setAttribute('src', origImg.src);
                }
            });
        }

        const head = docClone.querySelector('head');
        const styleTag = document.createElement('style');
        styleTag.textContent = css;
        head.appendChild(styleTag);

        const body = docClone.querySelector('body');

        if (js) {
            const bootScript = document.createElement('script');
            bootScript.textContent = `try { localStorage.setItem('familyTreeData', ${JSON.stringify(dataJson)}); } catch(e){}`;
            body.appendChild(bootScript);

            const mainScript = document.createElement('script');
            mainScript.textContent = js;
            body.appendChild(mainScript);
        } else {
            const noJsNote = document.createElement('div');
            noJsNote.setAttribute('style', 'position:fixed;top:60px;right:20px;background:#3d2817;color:#e8d5a8;padding:14px 20px;border-radius:10px;z-index:9999;font-family:Cairo,sans-serif;max-width:340px;line-height:1.6;border:1px solid #8b6914');
            noJsNote.innerHTML = '<strong>عرض ثابت</strong><br>هذا الملف يعرض الصور والبيانات فقط. للتفاعل الكامل افتح الملف من المتصفح عبر خادم محلي.';
            body.appendChild(noJsNote);
        }

        return '<!DOCTYPE html>\n' + docClone.outerHTML;
    }

    async function exportCompleteHTML() {
        showNotification('جاري إعداد النسخة الكاملة...', 'info');
        try {
            const html = await buildCompleteHTML();
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `شجرة-العائلة-بركاش-${dateStr}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            const sizeKb = Math.round(blob.size / 1024);
            showNotification(`تم التصدير بنجاح (${sizeKb} كيلوبايت)`, 'success');
            return blob;
        } catch (err) {
            console.error(err);
            showNotification('فشل التصدير: ' + err.message, 'error');
            return null;
        }
    }

    async function sendByEmail() {
        const blob = await exportCompleteHTML();
        if (!blob) return;

        const total = familyData.length;
        const deceased = familyData.filter(m => m.deathDate).length;
        const subject = encodeURIComponent('شجرة عائلة بركاش - نسخة محدثة');
        const body = encodeURIComponent(
            'السلام عليكم،\n\n' +
            'تجدون مرفقاً نسخة محدثة من شجرة عائلة بركاش.\n\n' +
            `• إجمالي الأعضاء: ${total}\n` +
            `• الأحياء: ${total - deceased}\n` +
            `• المتوفون رحمهم الله: ${deceased}\n\n` +
            'الملف HTML قائم بذاته يحوي جميع الصور والبيانات. افتحه بأي متصفح.\n\n' +
            'ملاحظة: تم تحميل الملف على جهازك. الرجاء إرفاقه يدوياً بهذه الرسالة قبل الإرسال.\n\n' +
            'تحياتي'
        );

        setTimeout(() => {
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
            showNotification('تم فتح برنامج البريد. الرجاء إرفاق الملف يدوياً', 'info');
        }, 800);
    }

    // === CONTEXT MENU ===
    let contextMemberId = null;

    function showContextMenu(e, memberId) {
        const menu = $('#contextMenu');
        contextMemberId = memberId;
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.classList.add('active');

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', hideContextMenu, { once: true });
        }, 10);
    }

    function hideContextMenu() {
        const menu = $('#contextMenu');
        menu.classList.remove('active');
        contextMemberId = null;
    }

    function handleContextAction(action) {
        if (!contextMemberId) return;
        const member = familyData.find(m => m.id === contextMemberId);
        if (!member) return;

        switch (action) {
            case 'addChild':
                openAddForm(contextMemberId);
                break;
            case 'addSpouse':
                openAddSpouseForm(contextMemberId);
                break;
            case 'edit':
                openEditForm(contextMemberId);
                break;
            case 'delete':
                deleteMember(contextMemberId);
                break;
        }
        hideContextMenu();
    }

    function openAddSpouseForm(memberId) {
        const member = familyData.find(m => m.id === memberId);
        if (!member) return;

        const panel = $('#addPanel');
        const form = $('#addForm');
        const title = $('#formTitle');
        const deleteBtn = $('#deleteBtn');

        form.reset();
        $('#editId').value = '';
        $('#fieldPhoto').value = 'images/default.svg';
        $('#imagePreview').innerHTML = '<span class="image-preview-text">انقر لاختيار صورة</span>';
        $('#removeImageBtn').style.display = 'none';
        deleteBtn.style.display = 'none';
        title.textContent = 'إضافة زوج/ة - ' + member.name;

        // Initialize spouses list
        form.dataset.spouses = '[]';
        renderSpousesList([]);

        // Set role based on gender
        const roleSelect = $('#fieldRole');
        if (member.gender === 'male') {
            roleSelect.value = 'زوجة';
        } else {
            roleSelect.value = 'زوج';
        }

        // Set gender opposite
        const genderSelect = $('#fieldGender');
        genderSelect.value = member.gender === 'male' ? 'female' : 'male';

        panel.classList.add('active');
        $('#overlay').classList.add('active');

        // Store spouse reference
        form.dataset.spouseFor = memberId;
    }

    // === BIND EVENTS ===
    function bindEvents() {
        // Context menu
        $$('.context-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                handleContextAction(item.dataset.action);
            });
        });

        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.person-card')) {
                hideContextMenu();
            }
        });

        // Nav buttons
        $('#searchBtn').addEventListener('click', () => {
            $('#searchPanel').classList.toggle('active');
            $('#overlay').classList.toggle('active');
            if ($('#searchPanel').classList.contains('active')) {
                setTimeout(() => $('#searchInput').focus(), 300);
            }
        });

        $('#addBtn').addEventListener('click', () => openAddForm());
        $('#settingsBtn').addEventListener('click', () => {
            $('#settingsPanel').classList.toggle('active');
            $('#overlay').classList.toggle('active');
        });

        // Close buttons
        $('#modalClose').addEventListener('click', closeModal);
        $('#searchClose').addEventListener('click', () => {
            $('#searchPanel').classList.remove('active');
            $('#overlay').classList.remove('active');
        });
        $('#addClose').addEventListener('click', closeForm);
        $('#settingsClose').addEventListener('click', () => {
            $('#settingsPanel').classList.remove('active');
            $('#overlay').classList.remove('active');
        });
        $('#overlay').addEventListener('click', () => {
            closeModal();
            $('#searchPanel').classList.remove('active');
            $('#addPanel').classList.remove('active');
            $('#settingsPanel').classList.remove('active');
            $('#overlay').classList.remove('active');
        });

        // Form
        $('#addForm').addEventListener('submit', handleFormSubmit);
        $('#addCancel').addEventListener('click', closeForm);
        $('#deleteBtn').addEventListener('click', () => {
            const editId = $('#editId').value;
            if (editId) deleteMember(parseInt(editId));
        });

        // Image upload
        $('#chooseImageBtn').addEventListener('click', () => $('#imageFile').click());
        $('#imageFile').addEventListener('change', (e) => {
            if (e.target.files[0]) handleImageUpload(e.target.files[0]);
        });
        $('#removeImageBtn').addEventListener('click', removeImage);
        $('#imagePreview').addEventListener('click', () => $('#imageFile').click());

        // Spouse list in form
        $('#addSpouseToList').addEventListener('click', addSpouseByName);
        $('#fieldSpouseName').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addSpouseByName(); }
        });

        // Search
        $('#searchInput').addEventListener('input', (e) => handleSearch(e.target.value));

        // Zoom
        $('#zoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
        $('#zoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
        $('#zoomReset').addEventListener('click', () => {
            zoom = 1;
            setZoom(1);
            const canvas = $('#treeCanvas');
            if (canvas) canvas.style.transform = 'scale(1)';
        });

        // Pan
        const container = $('#treeContainer');
        if (container) {
            container.addEventListener('mousedown', (e) => {
                if (e.target.closest('.person-card') || e.target.closest('.zoom-btn')) return;
                isDragging = true;
                dragStartX = e.clientX - panX;
                dragStartY = e.clientY - panY;
                container.style.cursor = 'grabbing';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                panX = e.clientX - dragStartX;
                panY = e.clientY - dragStartY;
                const canvas = $('#treeCanvas');
                if (canvas) {
                    canvas.style.transform = `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`;
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                if (container) container.style.cursor = 'grab';
            });

            container.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.05 : 0.05;
                setZoom(zoom + delta);
            }, { passive: false });
        }

        // Settings
        $$('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                document.documentElement.style.setProperty('--bg-primary', color);
                saveSettings('bgColor', color);
                $$('.color-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        $('#fontSize').addEventListener('input', (e) => {
            document.documentElement.style.fontSize = e.target.value + 'px';
            saveSettings('fontSize', e.target.value);
        });

        // Export/Import/Reset
        $('#exportBtn').addEventListener('click', exportData);
        $('#importFile').addEventListener('change', (e) => {
            if (e.target.files[0]) importData(e.target.files[0]);
        });
        $('#resetBtn').addEventListener('click', resetData);

        // Export full HTML & Email
        const exportHtmlBtn = $('#exportHtmlBtn');
        if (exportHtmlBtn) exportHtmlBtn.addEventListener('click', exportCompleteHTML);
        const emailBtn = $('#emailBtn');
        if (emailBtn) emailBtn.addEventListener('click', sendByEmail);

        // Window resize
        window.addEventListener('resize', () => {
            requestAnimationFrame(() => drawConnections());
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
                $('#searchPanel').classList.remove('active');
                $('#addPanel').classList.remove('active');
                $('#settingsPanel').classList.remove('active');
                $('#overlay').classList.remove('active');
            }
        });
    }

    // === PUBLIC API ===
    window.FamilyApp = {
        editMember,
        deleteMember,
        openAddForm,
        renderTree
    };

    // === START ===
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
