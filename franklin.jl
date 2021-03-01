using Franklin
using Dates

function serve_twl()
    serve(on_write=on_write, clear=true)
end

"""

Move the folder structure from blog/YYYY-MM-DD-TITLE to blog/title
Needs to be called with serve(on_write=on_write)
"""
function on_write(pg, fd_vars)
    rpath = fd_vars["fd_rpath"].first
    # get folder
    rpath = replace(rpath, "index.md" => "")
    if startswith(rpath, "blog/")
        new_name = replace(rpath, r"blog/\d{4}-\d{2}-\d{2}-" => "blog/")
        if !isfile("__site/$new_name")
            mkpath("__site/$new_name")
        end
        mv("__site/$rpath", "__site/$new_name"; force=true)
    end
end

function new_post(title; desc="", isjulia=true, tags=[], overwrite=false)
    date = Dates.format(today(), "yyyy-mm-dd")
    y = Dates.format(today(), "yyyy")
    m = Dates.format(today(), "mm")
    d = Dates.format(today(), "dd")
    text = ""

    text *= "@def title = \"$title\"\n"
    text *= "@def date = Date($y, $m, $d)\n"
    text *= "@def desc = \"$desc\"\n"
    text *= "@def rss = \"$desc\"\n"
    if isjulia
        text *= "@def rss_category = \"julia\"\n"
    end
    text *= "@def tags = $tags\n"
    text *= "@def mintoclevel=2\n"

    folder = title
    folder = lowercase(replace(folder, " "=>"-"))

    mkpath("blog/$date-$folder")
    mkpath("_assets/blog/$date-$folder/images")
    if overwrite || !isfile("blog/$date-$folder/index.md")
        write("blog/$date-$folder/index.md", text)
        println("blog/$date-$folder/index.md")
    else
        println("Post exists already maybe you want to use ;overwrite=true. Be careful!")
    end
end

function prepare_publish()
    Franklin.serve(on_write=on_write, single=true, clear=true)
    Franklin.lunr()
end
