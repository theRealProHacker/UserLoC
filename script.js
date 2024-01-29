// Toast stuff
const toast_container = document.querySelector('.toast-container')
const toast_template = document.getElementById('toast-template')
const title_toast_template = document.getElementById('title-toast-template')

const show_toast = (text, color = "black", bgcolor = "white") => {
    const toast_elem = toast_template.content.cloneNode(true).firstElementChild
    const toast_body = toast_elem.querySelector('.toast-body')
    const toast_button = toast_elem.querySelector('button.btn-close')
    toast_body.textContent = text
    toast_elem.classList.add(`bg-${bgcolor}`)
    toast_body.classList.add(`text-${color}`)
    toast_button.classList.add(`btn-close-${color}`)
    toast_container.appendChild(toast_elem)
    const toast = new bootstrap.Toast(toast_elem)
    toast.show()
}

const show_title_toast = (title, text) => {
    const toast_elem = title_toast_template.content.cloneNode(true).firstElementChild
    const toast_title = toast_elem.querySelector('strong')
    const toast_text = toast_elem.querySelector('.toast-body')
    toast_title.textContent = title
    toast_text.textContent = text
    toast_container.appendChild(toast_elem)
    const toast = new bootstrap.Toast(toast_elem)
    toast.show()
}

// Applicaton logic
const does_user_exist = async (username, where) => {
    url = (where === 'github') ? `https://api.github.com/users/${username}` : `https://api.gitlab.com/users?username=${username}`
    const r = await fetch(url)
    return r.status === 200
}

const get_user_repos = async (username, where) => {
    url = (where === 'github') 
        // ? `https://api.github.com/users/${username}/repos/`
        ? `https://api.github.com/search/repositories?q=user:${username}`
        : `https://gitlab.com/api/v4/users/${username}/projects`
    const r = await fetch(url)
    return r.json()
}

// input
const main_form = document.getElementById('main-form')
const username_input = document.getElementById('username')
const where_select = document.getElementById('where')
// output
const result_elem = document.getElementById('result')
const repo_badge_template = document.getElementById('repo-badge-template')
const queued_repo_bar = document.getElementById('queued-repo-bar')
const finished_repo_bar = document.getElementById('finished-repo-bar')
const pie_chart = document.getElementById('pie-chart')
const chart_canvas = document.getElementById('chart-canvas')

let chart;
const draw_chart = ()=>{
    if (finished_repos.length === 0) {
        pie_chart.style.display = 'none'
    } else {
        const raw_data = {}
        finished_repos.filter(repo => !repo.ignored).forEach(
            repo => repo.forEach(
                item =>{
                    if (item.language in raw_data) {
                        raw_data[item.language] += item.linesOfCode
                    } else {
                        raw_data[item.language] = item.linesOfCode
                    }
                }
            )
        )
        const {Total, ...locs} = raw_data
        if (pie_chart.style.display === 'none') {
            pie_chart.style.display = 'block'
            setTimeout(() => {
                chart_canvas.scrollIntoView({behavior: 'smooth'})
            }, 100)
        }
        const cutoff = Math.min(0.01 * Total, 100)
        const labels = Object.keys(locs).filter(key => locs[key] > cutoff && key in gh_colors)
        labels.sort((a, b) => locs[b] - locs[a])
        const data = labels.map(key => locs[key])
        const backgroundColor = labels.map(key => gh_colors[key])

        if (!chart) {
            chart = new Chart(chart_canvas, {
                type: 'pie',
                data: {
                    labels,
                    datasets: [{
                        label: 'Lines of Code',
                        data,
                        backgroundColor,
                        hoverOffset: 4,
                        borderJoinStyle: 'round',
                    }]
                },
                options: {
                    plugins: {
                        legend: {
                            position: 'right',
                        }
                    }
                }
            });
        } else {
            chart.data.labels = labels
            chart.data.datasets[0].data = data
            chart.data.datasets[0].backgroundColor = backgroundColor
            chart.update()
        }
    }
}

let spinner;
const finished_repos = [] // contains the actual data

const get_repo_data = async (username, reponame, where) => {
    const url = `https://api.codetabs.com/v1/loc?${where}=${username}/${reponame}`
    const r = await fetch(url)
    const data = await r.json()
    console.log(r)
    if (r.status === 429) {
        return await get_repo_data(username, reponame, where)
    } else if (!r.ok) {
        throw new WebTransportError(`Error getting repo data for ${username}/${reponame} (${r.statusText})`)
    }
    return data
}

let timeout;
const work = async (username, where) => {
    if (queued_repo_bar.children.length == 0){
        spinner.remove()
        return
    };
    let badge = queued_repo_bar.children.item(0)
    try {
        let repo_data = await get_repo_data(username, badge.dataset.repo, where)
        finished_repos.push(repo_data)
        badge.classList.remove('bg-light')
        badge.classList.add('bg-warning')
        finished_repo_bar.insertBefore(badge, spinner)
        badge.onclick = () => {
            badge.classList.toggle('ignored-repo')
            repo_data.ignored = !repo_data.ignored
            draw_chart()
        }
        draw_chart()
    } catch (e) {
        badge.remove()
        if (e instanceof WebTransportError) {
            show_toast(e.message, 'danger', 'black')
        } else {
            console.error(e)
        }
    }
    timeout = setTimeout(work, 5000, username, where)
}

const on_submit = async (_) => {
    username_input.blur()
    const username = username_input.value
    const where = where_select.value
    const user_exists = await does_user_exist(username, where)
    if (user_exists) {
        try {
            const user_repos = (await get_user_repos(username, where)).items
            // Clear old data
            finished_repos.length = 0;
            queued_repo_bar.innerHTML = ''
            finished_repo_bar.innerHTML = '<div class="spinner-border text-warning  mx-2" role="status"><span class="visually-hidden">Loading...</span></div>'
            clearTimeout(timeout)
            spinner = finished_repo_bar.firstElementChild

            user_repos.forEach(repo => {
                const badge = repo_badge_template.content.cloneNode(true).firstElementChild
                badge.dataset.repo = repo.name
                badge.querySelector("div").textContent = repo.name
                queued_repo_bar.appendChild(badge)
            })
            result_elem.classList.remove('d-none')
            draw_chart()
            show_title_toast('Success', `Found ${user_repos.length} repos. This will take about ${user_repos.length * 5} seconds due to API limits.`)
            await work(username, where)
        } catch (e) {
            console.error(e)
            show_toast('Error getting user repos', 'danger', 'black')
        }
    } else {
        show_toast(`User "${username}" does not exist`, 'danger', 'black')
    }
}

main_form.onsubmit = (e) => {
    e.preventDefault()
    on_submit(e)
}