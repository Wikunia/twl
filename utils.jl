using Franklin
using Dates, Random
using Base.Meta: isexpr

# common
# ======

const SITE_TITLE = globvar(:website_title)
const SITE_DESC  = globvar(:website_descr)
const SITE_URL   = globvar(:website_url)
const TWITTER_ID = "@opensourcesblog"

macro get(ex)
    @assert isexpr(ex, :call)
    method = first(ex.args)
    varname = last(ex.args)
    return :(let
        var = $(esc(ex))
        @assert !isnothing(var) string("$($(method)) `$($(varname))` isn't defined: ",
                                       $(method), '(', join(repr.([$(map(esc, ex.args[2:end])...)]), ", "), ')', # call args
                                       )
        var
    end)
end

macro get(ex, default)
    @assert isexpr(ex, :call)
    method = first(ex.args)
    varname = last(ex.args)
    return :(let
        var = $(esc(ex))
        isnothing(var) ? $(esc(default)) : var
    end)
end

# https://github.com/aviatesk/aviatesk.github.io/blob/3987e6b258709ee14bb921b1033617798f66e606/utils.jl
function hfun_ogp()
    url            = joinpath(SITE_URL, strip(get_url(locvar(:fd_rpath)), '/'))
    title          = @get(locvar(:title), SITE_TITLE)
    desc           = @get(locvar(:desc), SITE_DESC)
    img            = @get(locvar(:page_img), nothing)
    published_time = @get(locvar(:date), string(today()))

    return """
    <meta property="og:url" content="$(url)" />
    <meta property="og:title" content="$(title)" />
    <meta property="og:image" content="$(img)" />
    <meta property="og:type" content="article" />
    <meta property="og:description" content="$(desc)" />
    <meta property="og:published_time" content="$(published_time)" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:site" content="$(TWITTER_ID)" />
    <meta name="twitter:creator" content="$(TWITTER_ID)" />
    """
end


html_img_click(src, alt) = "[![$(Franklin.htmlesc(alt))]($src)]($src)"

function lx_figclick(lx, _)
    # keep this first line
    brace_content = Franklin.content(lx.braces[1]) # input string
    alt, rpath = strip.(split(brace_content, ','))
    path  = Franklin.parse_rpath(rpath; canonical=false, code=true)
    return html_img_click(path, alt)
end

function lx_version(lx, _)
    # keep this first line
    version = Franklin.content(lx.braces[1]) # input string
    giturl = locvar("giturl")
    return "[$version]($giturl/releases/tag/$version)"
end

function hfun_show_tags()
    tags = locvar("tags")
    html_tags = map(x->"<a href=\"../../tag/$x\">$x</a>", tags)
    return join(html_tags, ", ")
end


function get_matching_paths(post_type)
    rpaths = String[]
    for (root, dirs, files) in walkdir("blog")
        for file in files
            if file == "index.md"
                push!(rpaths, joinpath(root, file)[1:end-3])
            end
        end
    end

    matching_paths = String[]
    dates = Dates.Date[]
    for ref in rpaths
        ref == "index" && continue
        categories = pagevar(ref, "categories")
        if post_type in categories
            push!(matching_paths, ref)
            push!(dates, pagevar(ref, "date"))
        end
    end

    order = sortperm(dates; rev=true)
    return matching_paths[order]
end

function hfun_navbar(post_type)
    post_type = post_type[1]
    matching_paths = get_matching_paths(post_type)

    set_current = false
    # remove /index.md
    current_path = locvar("fd_rpath")[1:end-9]
    result = ""
    for ref in matching_paths
        pos = findlast('/', ref)
        page_name = ref[1:pos-1]
        link = replace(page_name, r"blog/\d{4}-\d{2}-\d{2}-" => "blog/")
        cat_title = pagevar(ref, "cat_title")
        if cat_title === nothing
            cat_title = pagevar(ref, "title")
        end
        if current_path == page_name && isempty(locvar(:fd_tag))
            set_current = true
            result *= "<li class=\"current\"><a href='/$link'>$cat_title</a></li>"
        else
            result *= "<li><a href='/$link'>$cat_title</a></li>"
        end
    end
    li_class = set_current ? "active" : ""
    start = "<li class=\"$li_class\"><a href='' class='has-arrow' aria-expanded='$set_current'>$post_type</a><ul>"
    result = "$start $result</ul></li>"
    return result
end

function get_cat_title(ref)
    isempty(ref) && return ""
    pos = findlast('/', ref)
    page_name = ref[1:pos-1]
    link = replace(page_name, r"blog/\d{4}-\d{2}-\d{2}-" => "blog/")
    cat_title = pagevar(ref, "cat_title")
    if cat_title === nothing
        cat_title = pagevar(ref, "title")
    end
    return cat_title
end

function get_cat_link(ref)
    isempty(ref) && return ""
    pos = findlast('/', ref)
    page_name = ref[1:pos-1]
    link = replace(page_name, r"blog/\d{4}-\d{2}-\d{2}-" => "blog/")
    cat_title = pagevar(ref, "cat_title")
    if cat_title === nothing
        cat_title = pagevar(ref, "title")
    end
    return "<a href='/$link'>$cat_title</a>"
end

function hfun_latest_in_category(params)
    category = params[1]
    number_of_posts = parse(Int, params[2])
    matching_paths = get_matching_paths(category)

    set_current = false
    # remove /index.md
    current_path = locvar("fd_rpath")[1:end-9]
    result = ""
    counter = 0
    for ref in matching_paths
        counter += 1
        pos = findlast('/', ref)
        page_name = ref[1:pos-1]
        link = replace(page_name, r"blog/\d{4}-\d{2}-\d{2}-" => "blog/")
        cat_title = pagevar(ref, "cat_title")
        if cat_title === nothing
            cat_title = pagevar(ref, "title")
        end
        if current_path == page_name && isempty(locvar(:fd_tag))
            set_current = true
            result *= "<li class=\"current\"><a href='/$link'>$cat_title</a></li>"
        else
            result *= "<li><a href='/$link'>$cat_title</a></li>"
        end
        if counter == number_of_posts
            break
        end
    end
    return result
end

function hfun_newest_posts(params=[1,typemax(Int)])
    from, to = parse.(Int, params)
    rpaths = String[]
    for file in keys(Franklin.ALL_PAGE_VARS)
        if startswith(file, "blog/")
            push!(rpaths, file)
        end
    end

    dates = Dates.Date[]
    for ref in rpaths
        push!(dates, pagevar(ref, "date"))
    end
    result = "<div>"
    order = sortperm(dates; rev=true)
    counter = 0
    for ref in rpaths[order]
        counter += 1
        if counter < from
            continue
        end
        pos = findlast('/', ref)
        page_name = ref[1:pos-1]
        page_name = replace(page_name, r"blog/\d{4}-\d{2}-\d{2}-" => "blog/")
        title = pagevar(ref, "title")
        result *= "<h3><u><a href='/$page_name'>$title</a></u></h3>"
        result *= "<p class='post-list-desc'>$(pagevar(ref, "desc"))</p>"
        date = pagevar(ref, "date")
        str_date = Dates.format(date, "dd U YYYY")
        tags = join(map(tag->"<a href=\"tag/$tag\">$tag</a>", pagevar(ref, "tags")), " + ")
        result *= "<p class='post-list-date'>$(str_date) in $tags</p><br>"
        if counter == to
            break
        end
    end
    result *= "</div>"
    return result
end

function hfun_random_post()
    pages = keys(Franklin.ALL_PAGE_VARS)
    page = rand(pages)
    title = pagevar(page, "title")
    page = page[1:end-6]
    return "<a href=\"/$page\"> $title</a>"
end

function hfun_pages_with_tag()::String
    tag = locvar(:fd_tag)

    c = IOBuffer()
    write(c, "<ul>")

    rpaths = globvar("fd_tag_pages")[tag]
    sorter(p) = begin
        pvd = pagevar(p, "date")
        if isnothing(pvd)
            return Date(Dates.unix2datetime(stat(p * ".md").ctime))
        end
        return pvd
    end
    sort!(rpaths, by=sorter, rev=true)

    for rpath in rpaths
        title = pagevar(rpath, "title")
        if isnothing(title)
            title = "/$rpath/"
        end
        url = get_url(rpath)
        url = replace(url, r"blog/\d{4}-\d{2}-\d{2}-" => "blog/")
        write(c, "<li><a href=\"$url\">$title</a></li>")
    end
    write(c, "</ul>")

    return String(take!(c))
end

function hfun_url()
    url_part = locvar("fd_rpath")[17:end-8]
    return "https://opensourc.es/blog/$(url_part)"
end
